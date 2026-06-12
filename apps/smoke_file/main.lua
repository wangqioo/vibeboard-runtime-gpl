print("smoke file start")

if not file or not file.exists then
    error("file module missing")
end

if not file.exists("config.json") then
    error("config missing")
end

local config = file.read("config.json")
if not config or not string.find(config, "Shanghai") then
    error("config read failed")
end
print("smoke file config", string.len(config))

local handle = file.open("config.json", "r")
if not handle then
    error("file open failed")
end
local first_chunk = handle:read(64)
handle:close()
if not first_chunk or not string.find(first_chunk, "city") then
    error("file handle read failed")
end

local entries = file.list(".")
if not entries then
    error("file list failed")
end
local found_config = false
for _, name in ipairs(entries) do
    if name == "config.json" then
        found_config = true
    end
end
if not found_config then
    error("file list missing config")
end

local ok, err = file.write("runtime-state.txt", "smoke_file=ok\n")
if not ok then
    error(err or "file write failed")
end

if not file.exists("runtime-state.txt") then
    error("runtime-state write missing")
end

print("smoke file ok", #entries)
