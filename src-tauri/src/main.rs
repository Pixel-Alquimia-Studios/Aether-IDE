// Evita abrir una consola en builds release de Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aether_ide_lib::run()
}
