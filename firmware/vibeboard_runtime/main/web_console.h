#pragma once

#include "esp_err.h"
#include "esp_http_server.h"

esp_err_t vb_web_console_register(httpd_handle_t server);
