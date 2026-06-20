#pragma once

#include "module_host_api.h"
#include "nes_module_abi_v1.h"

#ifdef __cplusplus
extern "C" {
#endif

void vb_nes_host_v1_shim_init(module_host_api_v1 *host, const vb_module_host_api_t *source);

#ifdef __cplusplus
}
#endif
