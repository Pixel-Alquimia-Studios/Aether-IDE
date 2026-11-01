//! Proveedor personalizado (OpenAI-compatible con URL base configurable)
//!
//! Reglas de seguridad:
//! - La URL vive SOLO en Rust (estado + sesión); el frontend no la manda en
//!   cada llamada, solo al guardarla.
//! - Validación al guardar Y al usar (`validate_custom_base_url`).
//! - HTTPS obligatorio para hosts públicos; HTTP solo para loopback, rangos
//!   privados (10/8, 172.16/12, 192.168/16) y *.local (vLLM/LiteLLM en LAN).
//! - Rechaza otros esquemas, userinfo (user:pass@), fragmentos (#) y
//!   link-local (169.254/16).
//! - Este proveedor NO sigue redirecciones (`no_redirect_client`).

use std::sync::{Mutex, OnceLock};

static CUSTOM_BASE_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

pub(crate) fn custom_base_url_state() -> &'static Mutex<Option<String>> {
    CUSTOM_BASE_URL.get_or_init(|| Mutex::new(None))
}

/// URL base guardada (sin validar — validar con `validate_custom_base_url`)
pub(crate) fn current_base_url() -> Option<String> {
    custom_base_url_state()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
}

/// Guarda la URL base ya validada (el llamador valida antes)
pub(crate) fn store_base_url(url: Option<String>) {
    *custom_base_url_state()
        .lock()
        .unwrap_or_else(|p| p.into_inner()) = url;
}

/// Identidad del servidor: host minúsculas + puerto (localhost:8000 y
/// localhost:11434 son servidores distintos — la key queda ligada a ambos)
pub(crate) fn host_of(url: &str) -> Option<String> {
    let url = reqwest::Url::parse(url).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    Some(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host,
    })
}

/// ¿Cambia el host entre dos URLs base? (la key queda ligada al host)
pub(crate) fn host_changed(old: Option<&str>, new: &str) -> bool {
    match old.map(host_of) {
        Some(Some(old_host)) => host_of(new) != Some(old_host),
        _ => true,
    }
}

/// Valida una URL base para el proveedor personalizado.
/// Devuelve la URL normalizada (sin fragmento, con path conservado).
pub(crate) fn validate_custom_base_url(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("La URL base no puede estar vacía".to_string());
    }
    let url = reqwest::Url::parse(raw).map_err(|e| format!("URL inválida: {e}"))?;

    // Sin userinfo (user:pass@host) — nunca enviar credenciales incrustadas
    if !url.username().is_empty() || url.password().is_some() {
        return Err(
            "No se permiten credenciales en la URL (user:pass@host). Usa la API key."
                .to_string(),
        );
    }
    // Sin fragmento (#)
    if url.fragment().is_some() {
        return Err("La URL base no puede contener fragmento (#)".to_string());
    }

    let scheme = url.scheme();
    if scheme != "https" && scheme != "http" {
        return Err(format!(
            "Esquema no permitido: '{scheme}'. Solo https (público) o http (loopback/LAN)"
        ));
    }

    let Some(host) = url.host_str() else {
        return Err("La URL debe incluir un host".to_string());
    };
    let host = host.to_ascii_lowercase();

    let v4 = host.parse::<std::net::Ipv4Addr>().ok().map(|ip| ip.octets());
    let v6 = host
        .trim_matches(|c| c == '[' || c == ']')
        .parse::<std::net::Ipv6Addr>()
        .ok();

    let is_loopback = host == "localhost"
        || v6.map(|ip| ip.is_loopback()).unwrap_or(false)
        || v4.map(|o| o == [127, 0, 0, 1]).unwrap_or(false);
    let is_private_v4 = v4.map(|o| {
        o[0] == 10
            || (o[0] == 172 && (16..=31).contains(&o[1]))
            || (o[0] == 192 && o[1] == 168)
    }).unwrap_or(false);
    let is_local_mdns = host.ends_with(".local");
    let is_link_local_v4 = v4.map(|o| o[0] == 169 && o[1] == 254).unwrap_or(false);

    if is_link_local_v4 {
        return Err(
            "Dirección link-local (169.254.x.x) no permitida".to_string(),
        );
    }

    if scheme == "http" && !is_loopback && !is_private_v4 && !is_local_mdns {
        return Err(
            "HTTP solo se permite en loopback, redes privadas (10.x, 172.16-31.x, 192.168.x) o *.local. Para hosts públicos usa https."
                .to_string(),
        );
    }

    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// Cliente HTTP SIN redirecciones para el proveedor personalizado:
/// una 3xx se reporta como error en vez de seguirse silenciosamente
pub(crate) fn no_redirect_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("client sin redirecciones")
    })
}

/// Client que usa un proveedor OpenAI-compatible: el personalizado no sigue
/// redirecciones; los presets usan el client global
pub(crate) fn client_for(provider_id: &str) -> reqwest::Client {
    if provider_id == "custom" {
        no_redirect_client().clone()
    } else {
        crate::ai::http_client()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_publico_ok() {
        assert!(validate_custom_base_url("https://api.ejemplo.com/v1").is_ok());
        assert!(validate_custom_base_url("https://mi-servidor.org").is_ok());
    }

    #[test]
    fn http_publico_rechazado() {
        assert!(validate_custom_base_url("http://api.ejemplo.com/v1").is_err());
        assert!(validate_custom_base_url("http://8.8.8.8/v1").is_err());
        // hostname público con IP privada resuelta no es detectable aquí, pero
        // el host literal sí: cualquier http no-listado se rechaza
        assert!(validate_custom_base_url("http://midominio.com").is_err());
    }

    #[test]
    fn http_loopback_y_lan_ok() {
        assert!(validate_custom_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_custom_base_url("http://127.0.0.1:8000/v1").is_ok());
        assert!(validate_custom_base_url("http://[::1]:1234/v1").is_ok());
        assert!(validate_custom_base_url("http://10.0.0.5:8080").is_ok());
        assert!(validate_custom_base_url("http://172.16.1.1").is_ok());
        assert!(validate_custom_base_url("http://172.31.255.255").is_ok());
        assert!(validate_custom_base_url("http://192.168.1.50:8000/v1").is_ok());
        assert!(validate_custom_base_url("http://vllm.local/v1").is_ok());
        // límites del rango: 172.15 y 172.32 son públicos → rechazo con http
        assert!(validate_custom_base_url("http://172.15.0.1").is_err());
        assert!(validate_custom_base_url("http://172.32.0.1").is_err());
    }

    #[test]
    fn rechaza_userinfo_fragmento_y_otros_esquemas() {
        assert!(validate_custom_base_url("https://user:pass@api.ejemplo.com").is_err());
        assert!(validate_custom_base_url("https://api.ejemplo.com/v1#frag").is_err());
        assert!(validate_custom_base_url("ftp://api.ejemplo.com").is_err());
        assert!(validate_custom_base_url("file:///etc/passwd").is_err());
        assert!(validate_custom_base_url("javascript:alert(1)").is_err());
        assert!(validate_custom_base_url("").is_err());
        assert!(validate_custom_base_url("no-es-una-url").is_err());
    }

    #[test]
    fn rechaza_link_local() {
        assert!(validate_custom_base_url("http://169.254.1.1/v1").is_err());
        assert!(validate_custom_base_url("https://169.254.169.254").is_err());
    }

    #[test]
    fn https_siempre_ok_incluso_lan() {
        // https no tiene la restricción de red: loopback/LAN con https vale
        assert!(validate_custom_base_url("https://192.168.1.50/v1").is_ok());
        assert!(validate_custom_base_url("https://localhost").is_ok());
    }

    #[test]
    fn host_changed_liga_la_key_al_host_y_puerto() {
        // Mismo host y puerto, distinto path: NO cambia
        assert!(!host_changed(
            Some("https://api.ejemplo.com/v1"),
            "https://api.ejemplo.com/v2"
        ));
        // Distinto puerto = distinto servidor (vLLM vs LM Studio): SÍ cambia
        assert!(host_changed(
            Some("http://localhost:8000"),
            "http://localhost:11434"
        ));
        // Sin URL previa: siempre se pide key de nuevo
        assert!(host_changed(None, "https://api.ejemplo.com"));
        // Distinto host: SÍ cambia
        assert!(host_changed(
            Some("https://api.a.com"),
            "https://api.b.com"
        ));
    }

    #[test]
    fn sin_redirecciones_en_custom() {
        // Servidor local que responde 302 → el client NO debe seguirlo
        use std::io::{Read, Write};
        use std::net::TcpListener;
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let addr = listener.local_addr().expect("addr");
        let target = format!("http://{addr}/destino");

        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let resp = "HTTP/1.1 302 Found\r\nLocation: /destino\r\nContent-Length: 0\r\n\r\n";
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.flush();
        });

        let client = no_redirect_client();
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let status = rt.block_on(async move {
            client
                .get(&target)
                .send()
                .await
                .expect("send")
                .status()
                .as_u16()
        });
        handle.join().expect("thread");
        assert_eq!(status, 302, "la redirección NO debe seguirse");
    }

    #[test]
    fn client_for_no_falla_para_presets() {
        // client_for devuelve un client válido para presets y para custom
        let _ = client_for("openai");
        let _ = client_for("custom");
    }
}
