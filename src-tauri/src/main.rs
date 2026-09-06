// Application entry point. Windows release builds detach the console so no terminal
// window appears behind the shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ideascape_lib::run()
}
