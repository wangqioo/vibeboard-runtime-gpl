print("smoke network start")

local config = {
    ssid = "",
    password = "",
    url = "http://worldtimeapi.org/api/timezone/Asia/Shanghai"
}

if file.exists("wifi.json") then
    local text, read_err = file.read("wifi.json")
    if not text then
        error("wifi.json read failed: " .. tostring(read_err))
    end
    local parsed, parse_err = sjson.decode(text)
    if not parsed then
        error("wifi.json parse failed: " .. tostring(parse_err))
    end
    config = parsed
else
    print("wifi.json missing; copy wifi.example.json to wifi.json and set credentials")
end

local encoded = sjson.encode({ app = "smoke_network", city = "Shanghai" })
print("json encode ok " .. encoded)

time.settimezone("CST-8")
time.initntp("pool.ntp.org")
print("time now " .. tostring(time.get()))

if config.ssid == nil or config.ssid == "" then
    print("smoke network ready without wifi credentials")
else
    wifi.mode("sta")
    wifi.sta.config({ ssid = config.ssid, password = config.password or "" })
    wifi.sta.connect()

    local timer = tmr.create()
    local ticks = 0
    timer:alarm(1000, tmr.ALARM_AUTO, function()
        ticks = ticks + 1
        local ip = wifi.sta.getip()
        print("wifi poll " .. ticks .. " ip " .. tostring(ip and ip.ip))
        if ip and ip.ip and ip.ip ~= "0.0.0.0" then
            local response, http_err = http.get(config.url)
            if response then
                print("http status " .. tostring(response.status))
                print("http body bytes " .. tostring(#response.body))
            else
                print("http error " .. tostring(http_err))
            end
            timer:unregister()
        end
    end)
end

print("smoke network ready")
