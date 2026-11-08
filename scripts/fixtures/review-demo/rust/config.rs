use std::fs;

pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
}

/// Lee la configuración de base de datos del archivo por defecto.
pub fn load_database_config() -> DatabaseConfig {
    let raw = fs::read_to_string("db.toml").unwrap();
    let mut lines = raw.lines();
    let host_line = lines.next().unwrap();
    let port_line = lines.next().unwrap();
    DatabaseConfig {
        host: host_line
            .split('=')
            .nth(1)
            .unwrap()
            .trim()
            .trim_matches('"')
            .to_string(),
        port: port_line
            .split('=')
            .nth(1)
            .unwrap()
            .trim()
            .parse()
            .unwrap(),
    }
}
