//! Application start and command registration. The command list here is the entire Rust
//! surface the front end can reach.

pub mod assets;
pub mod blueprints;
pub mod commands;
pub mod db;
pub mod error;
pub mod fetch;

use commands::AppState;

pub fn run() {
    // No clipboard plugin: the WebView2 renderer supplies navigator.clipboard, so
    // src/features/cards uses that directly and the installer carries one less crate.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default());

    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::project::open_project,
        commands::project::current_project,
        commands::project::create_project,
        commands::project::close_project,
        commands::project::list_recent_projects,
        commands::project::default_project_parent,
        commands::blueprint::list_blueprints,
        commands::blueprint::create_blueprint_card,
        commands::blueprint::set_item_field,
        commands::blueprint::list_unplaced_items,
        commands::blueprint::item_context,
        commands::blueprint::expand_into_canvas,
        commands::lists::list_entries,
        commands::lists::add_list_entry,
        commands::lists::remove_list_entry,
        commands::canvas::list_canvases,
        commands::canvas::create_canvas,
        commands::canvas::rename_canvas,
        commands::canvas::delete_canvas,
        commands::canvas::restore_canvas,
        commands::canvas::update_canvas_view,
        commands::connection::list_connections,
        commands::connection::create_connection,
        commands::connection::restore_connection,
        commands::connection::update_connection,
        commands::connection::delete_connections,
        commands::asset::add_image_from_path,
        commands::asset::add_image_from_bytes,
        commands::asset::asset_statuses,
        commands::asset::assets_folder,
        commands::asset::create_image_card,
        commands::asset::update_image_dimensions,
        commands::fetch::classify_url,
        commands::fetch::fetch_link_preview,
        commands::fetch::fetch_video_metadata,
        commands::search::search_project,
        commands::settings::read_settings,
        commands::settings::write_settings,
        commands::settings::settings_location,
        commands::item::create_item,
        commands::item::update_item_payload,
        commands::item::delete_item,
        commands::item::restore_item,
        commands::placement::list_placements,
        commands::placement::create_placement,
        commands::placement::create_note_card,
        commands::placement::create_link_card,
        commands::placement::create_video_card,
        commands::placement::restore_card,
        commands::placement::update_placements,
        commands::placement::delete_placements,
        commands::placement::seed_note_cards,
        commands::placement::seed_mixed_cards,
        commands::project::perf_gate_requested,
        commands::project::perf_gate_project_path,
        commands::project::record_perf_result,
    ]);

    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::project::open_project,
        commands::project::current_project,
        commands::project::create_project,
        commands::project::close_project,
        commands::project::list_recent_projects,
        commands::project::default_project_parent,
        commands::blueprint::list_blueprints,
        commands::blueprint::create_blueprint_card,
        commands::blueprint::set_item_field,
        commands::blueprint::list_unplaced_items,
        commands::blueprint::item_context,
        commands::blueprint::expand_into_canvas,
        commands::lists::list_entries,
        commands::lists::add_list_entry,
        commands::lists::remove_list_entry,
        commands::canvas::list_canvases,
        commands::canvas::create_canvas,
        commands::canvas::rename_canvas,
        commands::canvas::delete_canvas,
        commands::canvas::restore_canvas,
        commands::canvas::update_canvas_view,
        commands::connection::list_connections,
        commands::connection::create_connection,
        commands::connection::restore_connection,
        commands::connection::update_connection,
        commands::connection::delete_connections,
        commands::asset::add_image_from_path,
        commands::asset::add_image_from_bytes,
        commands::asset::asset_statuses,
        commands::asset::assets_folder,
        commands::asset::create_image_card,
        commands::asset::update_image_dimensions,
        commands::fetch::classify_url,
        commands::fetch::fetch_link_preview,
        commands::fetch::fetch_video_metadata,
        commands::search::search_project,
        commands::settings::read_settings,
        commands::settings::write_settings,
        commands::settings::settings_location,
        commands::item::create_item,
        commands::item::update_item_payload,
        commands::item::delete_item,
        commands::item::restore_item,
        commands::placement::list_placements,
        commands::placement::create_placement,
        commands::placement::create_note_card,
        commands::placement::create_link_card,
        commands::placement::create_video_card,
        commands::placement::restore_card,
        commands::placement::update_placements,
        commands::placement::delete_placements,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("the IdeaScape window could not start");
}
