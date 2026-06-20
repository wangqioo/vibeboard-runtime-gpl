#include "lua_sjson.h"

#include <math.h>
#include <stdbool.h>

#include "cJSON.h"
#include "lauxlib.h"
#include "lua.h"

static void push_json_value(lua_State *L, const cJSON *item);

static bool table_is_array(lua_State *L, int index, lua_Integer *len_out)
{
    lua_Integer max_index = 0;
    lua_Integer count = 0;
    lua_pushnil(L);
    while (lua_next(L, index) != 0) {
        if (!lua_isinteger(L, -2)) {
            lua_pop(L, 2);
            return false;
        }
        lua_Integer key = lua_tointeger(L, -2);
        if (key <= 0) {
            lua_pop(L, 2);
            return false;
        }
        if (key > max_index) {
            max_index = key;
        }
        count++;
        lua_pop(L, 1);
    }
    if (len_out != NULL) {
        *len_out = max_index;
    }
    return max_index == count;
}

static cJSON *json_from_lua(lua_State *L, int index)
{
    int type = lua_type(L, index);
    switch (type) {
        case LUA_TNIL:
            return cJSON_CreateNull();
        case LUA_TBOOLEAN:
            return cJSON_CreateBool(lua_toboolean(L, index));
        case LUA_TNUMBER:
            return cJSON_CreateNumber(lua_tonumber(L, index));
        case LUA_TSTRING:
            return cJSON_CreateString(lua_tostring(L, index));
        case LUA_TTABLE:
            break;
        default:
            luaL_error(L, "unsupported json value type: %s", lua_typename(L, type));
            return NULL;
    }

    int abs_index = lua_absindex(L, index);
    lua_Integer len = 0;
    bool is_array = table_is_array(L, abs_index, &len);
    cJSON *node = is_array ? cJSON_CreateArray() : cJSON_CreateObject();
    if (node == NULL) {
        return NULL;
    }

    if (is_array) {
        for (lua_Integer i = 1; i <= len; i++) {
            lua_geti(L, abs_index, i);
            cJSON *child = json_from_lua(L, -1);
            lua_pop(L, 1);
            if (child == NULL) {
                cJSON_Delete(node);
                return NULL;
            }
            cJSON_AddItemToArray(node, child);
        }
        return node;
    }

    lua_pushnil(L);
    while (lua_next(L, abs_index) != 0) {
        const char *key = luaL_checkstring(L, -2);
        cJSON *child = json_from_lua(L, -1);
        lua_pop(L, 1);
        if (child == NULL) {
            cJSON_Delete(node);
            return NULL;
        }
        cJSON_AddItemToObject(node, key, child);
    }
    return node;
}

static void push_json_array(lua_State *L, const cJSON *array)
{
    lua_newtable(L);
    int index = 1;
    const cJSON *item = NULL;
    cJSON_ArrayForEach(item, array) {
        lua_pushinteger(L, index++);
        push_json_value(L, item);
        lua_settable(L, -3);
    }
}

static void push_json_object(lua_State *L, const cJSON *object)
{
    lua_newtable(L);
    const cJSON *item = NULL;
    cJSON_ArrayForEach(item, object) {
        lua_pushstring(L, item->string);
        push_json_value(L, item);
        lua_settable(L, -3);
    }
}

static void push_json_value(lua_State *L, const cJSON *item)
{
    if (cJSON_IsNull(item)) {
        lua_pushnil(L);
    } else if (cJSON_IsBool(item)) {
        lua_pushboolean(L, cJSON_IsTrue(item));
    } else if (cJSON_IsNumber(item)) {
        double value = item->valuedouble;
        if (isfinite(value) && floor(value) == value) {
            lua_pushinteger(L, (lua_Integer)value);
        } else {
            lua_pushnumber(L, (lua_Number)value);
        }
    } else if (cJSON_IsString(item)) {
        lua_pushstring(L, item->valuestring);
    } else if (cJSON_IsArray(item)) {
        push_json_array(L, item);
    } else if (cJSON_IsObject(item)) {
        push_json_object(L, item);
    } else {
        lua_pushnil(L);
    }
}

static int sjson_decode(lua_State *L)
{
    const char *text = luaL_checkstring(L, 1);
    cJSON *root = cJSON_Parse(text);
    if (root == NULL) {
        lua_pushnil(L);
        lua_pushliteral(L, "json parse failed");
        return 2;
    }
    push_json_value(L, root);
    cJSON_Delete(root);
    return 1;
}

static int sjson_encode(lua_State *L)
{
    cJSON *root = json_from_lua(L, 1);
    if (root == NULL) {
        lua_pushnil(L);
        lua_pushliteral(L, "json encode failed");
        return 2;
    }
    char *text = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    if (text == NULL) {
        lua_pushnil(L);
        lua_pushliteral(L, "json print failed");
        return 2;
    }
    lua_pushstring(L, text);
    cJSON_free(text);
    return 1;
}

void vb_lua_sjson_register(lua_State *L)
{
    static const luaL_Reg sjson_functions[] = {
        {"decode", sjson_decode},
        {"encode", sjson_encode},
        {NULL, NULL},
    };
    luaL_newlib(L, sjson_functions);
    lua_pushvalue(L, -1);
    lua_setglobal(L, "json");
    lua_setglobal(L, "sjson");
}
