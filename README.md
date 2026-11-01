# Open with Paseo

Paseo plugin that adds "Open with Paseo" to the Windows Explorer folder context menu and opens the folder as a Paseo workspace with a new chat.

## Install

Requires [Paseo](https://paseo.sh) 0.13.0 or later on Windows with plugins turned on (Settings > Plugins > Enable plugins).

```sh
paseo plugin install https://github.com/alchemyyy/paseo_open_with_paseo
```

Loading the plugin registers the Explorer menu entry. `paseo plugin update open-with-paseo` updates the plugin; the [Plugin manager](https://github.com/alchemyyy/paseo_plugin_manager) plugin checks and updates installed plugins from the sidebar.

`paseo plugin remove open-with-paseo` uninstalls it: as the plugin stops, it deletes both Explorer registry keys and its `open-with-paseo` data folder under `PASEO_HOME` (default `~/.paseo`). Disabling the plugin, or all plugins, deletes the registry keys until it runs again. A plugin removed while disabled runs no code, so its data folder stays; delete it by hand.

The `paseo` command comes with the desktop app: Settings > Integrations > Command line puts it on `PATH`, or run `paseo.cmd` from the app's `resources\bin` folder.

To work on the plugin, clone this repository and install the folder instead (`paseo plugin install <folder>`), then run `paseo plugin reload open-with-paseo` after editing it.

## Features

- **Explorer menu entry.** When the plugin loads on Windows, it registers an **Open with Paseo** verb for the current user, with no admin rights needed. The verb appears when you right-click a folder and when you right-click blank space inside a folder. Its keys are `HKCU\Software\Classes\Directory\shell\OpenWithPaseo` and `...\Directory\Background\shell\OpenWithPaseo`. If you made an `OpenWithPaseo` verb by hand, the plugin replaces it. When the daemon runs under the Paseo desktop app, the entry uses Paseo's icon.
- **Launcher.** Each time the plugin loads, it rewrites `<PASEO_HOME>/open-with-paseo/open-with-paseo.ps1`, so edits to that file are lost. Explorer runs the script through `conhost --headless`, so no console window flashes. The script queues the folder as a JSON request in `<PASEO_HOME>/open-with-paseo/requests/`, then restores and focuses the Paseo window. If no Paseo window is open, it starts the desktop app, but only when the daemon belongs to the app.
- **Opening the folder.** The server watches the request folder and hands each request to a Paseo desktop window through a long-poll RPC (`open-with-paseo.next`). The window opens the folder's workspace. If the folder has no workspace yet, it creates the workspace and its project. If the workspace was archived, it restores it. The window then opens a new chat tab in that workspace.
- **Request handling.** Requests are handled oldest first, and each one goes to exactly one window. Requests older than 2 minutes, malformed requests, and requests with relative paths are dropped and deleted.
- **Desktop only.** Browser and mobile clients connected to the same daemon never take requests.

## Limitations

- The Explorer menu entry works only on Windows. On other platforms the plugin does nothing.
- The new chat opens through the app's internal route `/h/<server>/workspace/<id>?open=draft:new`. A Paseo update that changes this route breaks the new-chat step.
- If a folder is chosen while no Paseo window is open and Paseo does not start within 2 minutes, the request is discarded.
