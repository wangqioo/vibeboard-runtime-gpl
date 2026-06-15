# Runtime Wi-Fi Autoconnect Design

Date: 2026-06-15

## Goal

Make the board-side HTTP install service reachable after boot without first launching `apps/smoke_network`.

## Context

The runtime starts `install_service` on port 8080, but it does not currently start Wi-Fi. A board with a valid `apps/smoke_network/wifi.json` can join Wi-Fi only after a user launches that app from the native launcher. That makes the app upload loop depend on manual screen interaction.

## Design

Add a small runtime-owned Wi-Fi startup service:

- source files: `firmware/vibeboard_runtime/main/runtime_wifi.c` and `runtime_wifi.h`;
- entry point: `vb_runtime_wifi_start_from_sd(void)`;
- config path: `/sdcard/runtime/wifi.json`;
- compatibility fallback: `/sdcard/apps/smoke_network/wifi.json` for existing bring-up SD cards;
- supported JSON keys: `ssid` and `password`;
- behavior when the config file is absent, malformed, or has no SSID: log and skip Wi-Fi without failing boot;
- behavior when config is valid: initialize `esp_netif`, default event loop, Wi-Fi STA, configure credentials, start STA, and connect;
- IP evidence: log `runtime sta got ip <address>` on `IP_EVENT_STA_GOT_IP`.

The service is best-effort. Launcher startup and SD app discovery must continue even if Wi-Fi configuration or association fails.

## Non-Goals

- No credential UI.
- No AP provisioning.
- No credential migration or writes; the smoke app fallback is read-only compatibility.
- No blocking boot until DHCP succeeds.
- No secrets committed to git.

## Testing

Static firmware tests should verify:

- `main.c` calls `vb_runtime_wifi_start_from_sd()` after the SD card is mounted and before `vb_install_service_start()`;
- the new service reads `/sdcard/runtime/wifi.json`;
- missing config is treated as a skip, not a boot failure;
- the service logs `runtime sta got ip` on IP acquisition.

Board verification should flash the firmware, confirm boot still reaches `VibeBoard Runtime ready`, place a local SD config outside git, confirm the board joins Wi-Fi, then run the native HTTP uploader without `--transport nc`.
