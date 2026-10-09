use keyring::Entry;

const SERVICE: &str = "aether-ide";

fn entry(provider_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, provider_id)
        .map_err(|e| format!("No se pudo acceder al keychain del SO: {e}"))
}

pub fn get_key(provider_id: &str) -> Result<Option<String>, String> {
    match entry(provider_id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Error leyendo '{provider_id}' del keychain: {e}")),
    }
}

pub fn set_key(provider_id: &str, key: &str) -> Result<(), String> {
    entry(provider_id)?
        .set_password(key)
        .map_err(|e| format!("Error guardando '{provider_id}' en el keychain: {e}"))
}

pub fn delete_key(provider_id: &str) -> Result<(), String> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Error borrando '{provider_id}' del keychain: {e}")),
    }
}
