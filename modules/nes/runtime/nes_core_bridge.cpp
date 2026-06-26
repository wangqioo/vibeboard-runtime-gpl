#include "runtime/nes_core_bridge.h"

#include <string.h>

#include "Arduino.h"
#include "audio/nes_audio_out.h"
#include "core/bus.h"
#include "core/cartridge.h"
#include "video/nes_video_out.h"
#include "nes_port.h"

namespace
{

enum CoreState
{
    CoreEmpty = 0,
    CoreLoaded = 1,
    CoreRunning = 2,
    CorePaused = 3,
    CoreStopping = 4,
    CoreError = 5,
};

enum CoreStage
{
    StageIdle = 0,
    StageTaskStart = 10,
    StageInitBegin = 20,
    StageVideoBegin = 21,
    StageVideoReady = 22,
    StageCartridgeBegin = 30,
    StageCartridgeReady = 31,
    StageBusBegin = 40,
    StageBusResetBegin = 41,
    StageBusReady = 42,
    StageFrameBegin = 50,
    StageFrameClockDone = 51,
    StageFrameDone = 52,
    StageStopping = 90,
    StageError = 99,
};

static void copy_text(char *dst, size_t dst_size, const char *src)
{
    size_t i = 0;
    if (!dst || dst_size == 0)
    {
        return;
    }
    if (!src)
    {
        dst[0] = '\0';
        return;
    }
    while (i + 1 < dst_size && src[i])
    {
        dst[i] = src[i];
        i++;
    }
    dst[i] = '\0';
}

static uint32_t sanitize_nes_mask(uint32_t mask)
{
    return mask & 0xFFu;
}

static bool ptr_in_psram(const void *ptr)
{
    const uintptr_t addr = (uintptr_t)ptr;
    return addr >= 0x3C000000u && addr < 0x3E000000u;
}

class NesCoreRuntime
{
public:
    explicit NesCoreRuntime(const module_host_api_v1 *host)
        : m_host(host)
    {
        nes_port_set_host(host);
    }

    ~NesCoreRuntime()
    {
        stop(3000, true, nullptr, 0);
    }

    bool start(const char *rom_path, const nes_core_options_t *options, char *err, size_t err_size)
    {
        if (!m_host || !rom_path || !rom_path[0])
        {
            setError("rom path missing", err, err_size);
            return false;
        }
        if (m_task || m_running)
        {
            setError("nes already running", err, err_size);
            return false;
        }

        m_options = options ? *options : nes_core_options_t{};
        if (m_options.width == 0)
        {
            m_options.width = 256;
        }
        if (m_options.height == 0)
        {
            m_options.height = 240;
        }
        if (m_options.transfer_rows == 0)
        {
            m_options.transfer_rows = nes::config::kDefaultTransferRows;
        }
        if (m_options.target_fps == 0)
        {
            m_options.target_fps = 60;
        }
        if (m_options.audio_sample_rate == 0)
        {
            m_options.audio_sample_rate = 22050;
        }
        if (m_options.audio_bits_per_sample == 0)
        {
            m_options.audio_bits_per_sample = 16;
        }
        if (m_options.audio_channels == 0)
        {
            m_options.audio_channels = 1;
        }
        if (m_options.audio_volume_percent == 0)
        {
            m_options.audio_volume_percent = 80;
        }
        if (m_options.audio_volume_percent > 100)
        {
            m_options.audio_volume_percent = 100;
        }
        if (m_options.audio_queue_bytes == 0)
        {
            m_options.audio_queue_bytes = 32768;
        }
        if (m_options.audio_task_stack_bytes == 0)
        {
            m_options.audio_task_stack_bytes = 8192;
        }
        if (m_options.task_stack_bytes == 0)
        {
            m_options.task_stack_bytes = 16 * 1024;
        }
        if (m_options.task_priority == 0)
        {
            m_options.task_priority = 3;
        }

        copy_text(m_rom_path, sizeof(m_rom_path), rom_path);
        m_stop_requested = false;
        m_autorun = m_options.autorun != 0;
        m_paused = !m_autorun;
        m_running = false;
        m_task_exited = false;
        m_prepare_requested = false;
        m_prepare_result = 0;
        m_prepare_level = 0;
        m_step_frames = 0;
        m_frames = 0;
        m_started_ms = 0;
        m_stopped_ms = 0;
        m_last_error[0] = '\0';
        m_audio_error[0] = '\0';
        m_state = CoreLoaded;
        m_stage = StageIdle;

        void *task = nullptr;
        auto entry = reinterpret_cast<void (*)(void *)>(nes_port_exec_ptr(reinterpret_cast<const void *>(taskEntry)));
        const int32_t ret = m_host->task.create ? m_host->task.create("nes_core",
                                                                      entry,
                                                                      this,
                                                                      m_options.task_stack_bytes,
                                                                      m_options.task_priority,
                                                                      m_options.task_core,
                                                                      &task)
                                                : MODULE_ERR_UNSUPPORTED;
        if (ret != MODULE_OK || !task)
        {
            setError("create nes task failed", err, err_size);
            return false;
        }
        m_task = task;
        return true;
    }

    bool stop(uint32_t timeout_ms, bool force, char *err, size_t err_size)
    {
        if (!m_task && !m_running)
        {
            releaseCoreObjects();
            if (m_state != CoreError)
            {
                m_state = m_loaded ? CoreLoaded : CoreEmpty;
            }
            return true;
        }

        m_stop_requested = true;
        m_state = CoreStopping;
        setStage(StageStopping, "[nes.so] stop requested");
        const uint32_t start_ms = nes_port_millis();
        while (m_task && !m_task_exited && (nes_port_millis() - start_ms) < timeout_ms)
        {
            nes_port_delay(10);
        }

        if (m_task)
        {
            if (!m_task_exited && !force)
            {
                setError("nes stop timeout", err, err_size);
                return false;
            }
            if (m_host && m_host->task.remove)
            {
                m_host->task.remove(m_task);
            }
            m_task = nullptr;
            m_task_exited = false;
            m_running = false;
            m_stop_requested = false;
            m_autorun = false;
            m_paused = false;
            m_step_frames = 0;
            m_prepare_requested = false;
            m_prepare_result = 0;
            m_prepare_level = 0;
            releaseCoreObjects();
        }

        if (m_state != CoreError)
        {
            m_state = m_loaded ? CoreLoaded : CoreEmpty;
        }
        return true;
    }

    void pause(bool paused)
    {
        m_autorun = !paused;
        m_paused = paused;
        if (m_running)
        {
            m_state = paused ? CorePaused : CoreRunning;
        }
    }

    bool step(uint32_t frames, char *err, size_t err_size)
    {
        if (!m_task)
        {
            setError("nes is not running", err, err_size);
            return false;
        }
        if (frames == 0)
        {
            frames = 1;
        }
        if (frames > 120)
        {
            frames = 120;
        }
        m_autorun = false;
        m_paused = true;
        m_step_frames += frames;
        if (m_step_frames > 120)
        {
            m_step_frames = 120;
        }
        return true;
    }

    bool prepare(uint32_t timeout_ms, uint32_t level, char *err, size_t err_size)
    {
        if (!m_task)
        {
            setError("nes is not running", err, err_size);
            return false;
        }
        if (m_bus)
        {
            return true;
        }

        m_prepare_level = level;
        m_prepare_result = 0;
        m_prepare_requested = true;
        const uint32_t start_ms = nes_port_millis();
        while (m_prepare_requested && m_task && !m_task_exited &&
               (nes_port_millis() - start_ms) < timeout_ms)
        {
            nes_port_delay(10);
        }
        if (m_prepare_requested)
        {
            setError("nes init timeout", err, err_size);
            m_prepare_requested = false;
            return false;
        }
        if (m_prepare_result != 1)
        {
            if (err && err_size > 0)
            {
                copy_text(err, err_size, m_last_error[0] ? m_last_error : "nes init failed");
            }
            return false;
        }
        return true;
    }

    void input(uint32_t *out_gamepad_mask, uint32_t *out_nes_mask)
    {
        pollInput();
        if (out_gamepad_mask)
        {
            *out_gamepad_mask = m_last_gamepad_mask;
        }
        if (out_nes_mask)
        {
            *out_nes_mask = m_last_nes_mask;
        }
    }

    void setInputMask(uint32_t mask)
    {
        __atomic_store_n(&m_input_mask, sanitize_nes_mask(mask), __ATOMIC_RELEASE);
    }

    void status(nes_core_status_t *out)
    {
        if (!out)
        {
            return;
        }
        const uint32_t input_mask = __atomic_load_n(&m_input_mask, __ATOMIC_ACQUIRE);
        memset(out, 0, sizeof(*out));
        out->state = m_state;
        out->running = m_running ? 1 : 0;
        out->paused = m_paused ? 1 : 0;
        out->loaded = m_loaded ? 1 : 0;
        out->mapper = m_mapper_id;
        out->frames = m_frames;
        out->started_ms = m_started_ms;
        out->stopped_ms = m_stopped_ms;
        out->last_gamepad_mask = sanitize_nes_mask(input_mask);
        out->last_nes_mask = sanitize_nes_mask(input_mask);
        out->task_stack_ptr = m_task_stack_ptr;
        out->step_pending = m_step_frames;
        out->stage = m_stage;
        out->transfer_rows = m_video.active() ? m_video.spec().transfer_rows : m_options.transfer_rows;
        out->display_stream_supported = m_video.streamSupported() ? 1 : 0;
        out->display_stream_active = m_video.streamActive() ? 1 : 0;
        out->display_stream_slots = m_video.streamSlots();
        out->display_stream_queued = m_video.streamQueued();
        out->display_async_supported = m_video.asyncSupported() ? 1 : 0;
        out->display_async_active = m_video.asyncActive() ? 1 : 0;
        out->display_async_slots = m_video.asyncSlots();
        out->task_stack_psram = m_task_stack_psram ? 1 : 0;
        out->autorun = m_autorun ? 1 : 0;
        out->audio_requested = m_audio.requested() ? 1 : 0;
        out->audio_active = m_audio.active() ? 1 : 0;
        out->audio_apu_task_present = m_apu_task ? 1 : 0;
        out->audio_apu_task_started = __atomic_load_n(&m_apu_task_started, __ATOMIC_ACQUIRE) ? 1 : 0;
        out->audio_apu_task_exited = __atomic_load_n(&m_apu_task_exited, __ATOMIC_ACQUIRE) ? 1 : 0;
        out->audio_apu_task_ret = __atomic_load_n(&m_apu_task_ret, __ATOMIC_ACQUIRE);
        out->audio_apu_ticks = __atomic_load_n(&m_audio_apu_ticks, __ATOMIC_ACQUIRE);
        out->audio_sink_calls = __atomic_load_n(&m_audio_sink_calls, __ATOMIC_ACQUIRE);
        out->audio_sink_frames = __atomic_load_n(&m_audio_sink_frames, __ATOMIC_ACQUIRE);
        out->audio_written_bytes = m_audio.writtenBytes();
        out->audio_queued_bytes = (uint32_t)m_audio.queuedBytes();
        out->audio_dropped_bytes = m_audio.droppedBytes();
        copy_text(out->audio_backend, sizeof(out->audio_backend), m_audio.backendName());
        copy_text(out->audio_error, sizeof(out->audio_error), m_audio_error);
        copy_text(out->last_error, sizeof(out->last_error), m_last_error);
    }

    size_t readAudio(uint8_t *dst, size_t max_bytes)
    {
        return m_audio.read(dst, max_bytes);
    }

private:
    static void taskEntry(void *arg)
    {
        NesCoreRuntime *self = static_cast<NesCoreRuntime *>(arg);
        if (self)
        {
            self->taskLoop();
        }
    }

    static void apuTaskEntry(void *arg)
    {
        NesCoreRuntime *self = static_cast<NesCoreRuntime *>(arg);
        if (self)
        {
            self->apuTaskLoop();
        }
    }

    static void audioSinkCallback(void *user, const int16_t *samples, size_t frames)
    {
        NesCoreRuntime *self = static_cast<NesCoreRuntime *>(user);
        if (self)
        {
            self->handleAudioSamples(samples, frames);
        }
    }

    void apuTaskLoop()
    {
        __atomic_store_n(&m_apu_task_started, true, __ATOMIC_RELEASE);
        uint64_t next_batch_due = nes_port_micros();
        const uint32_t sample_rate = m_options.audio_sample_rate > 0 ? m_options.audio_sample_rate : 22050u;
        const uint32_t batch_us = (uint32_t)((256ULL * 1000000ULL) / sample_rate);
        while (!__atomic_load_n(&m_apu_task_stop, __ATOMIC_ACQUIRE) && !m_stop_requested)
        {
            const uint64_t now = nes_port_micros();
            if (now < next_batch_due)
            {
                const uint32_t sleep_us = (uint32_t)(next_batch_due - now);
                nes_port_delay(sleep_us / 1000u);
                continue;
            }
            if (now > next_batch_due + ((uint64_t)batch_us * 4u))
            {
                next_batch_due = now;
            }
            Bus *bus = m_bus;
            if (!bus || (m_paused && m_step_frames == 0))
            {
                nes_port_delay(1);
                next_batch_due = nes_port_micros() + batch_us;
                continue;
            }
            for (uint16_t i = 0; i < 256 && !__atomic_load_n(&m_apu_task_stop, __ATOMIC_ACQUIRE) && !m_stop_requested; ++i)
            {
                bus->cpu.apu.clock();
            }
            __atomic_add_fetch(&m_audio_apu_ticks, 256u, __ATOMIC_RELEASE);
            next_batch_due += batch_us;
            nes_port_yield();
        }

        __atomic_store_n(&m_apu_task_exited, true, __ATOMIC_RELEASE);
        parkCurrentTask();
    }

    void taskLoop()
    {
        while (!m_task)
        {
            nes_port_delay(1);
        }
        void *self_task = m_task;
        uint8_t stack_probe = 0;
        m_task_stack_ptr = (uint32_t)(uintptr_t)&stack_probe;
        m_task_stack_psram = ptr_in_psram(&stack_probe);
        m_running = true;
        m_state = CoreRunning;
        m_started_ms = nes_port_millis();
        setStage(StageTaskStart, "[nes.so] task start");

        if (m_task_stack_psram)
        {
            setError("nes task stack is in PSRAM; rebuild host with internal dynmod task stack", nullptr, 0);
            m_running = false;
            m_stop_requested = false;
            m_autorun = false;
            m_paused = false;
            m_step_frames = 0;
            m_prepare_requested = false;
            m_prepare_result = 2;
            m_prepare_level = 0;
            m_stopped_ms = nes_port_millis();
            m_task_exited = true;
            parkCurrentTask();
        }

        m_state = m_paused ? CorePaused : CoreRunning;
        const uint32_t frame_us = m_options.target_fps > 0 ? (1000000u / m_options.target_fps) : 16666u;
        uint64_t next_frame_due = nes_port_micros();
        while (!m_stop_requested)
        {
            if (m_prepare_requested)
            {
                m_prepare_result = createCoreObjects() ? 1 : 2;
                m_prepare_level = 0;
                m_prepare_requested = false;
                m_paused = true;
                m_state = m_prepare_result == 1 ? CorePaused : CoreError;
                next_frame_due = nes_port_micros();
                continue;
            }

            const bool single_step = m_step_frames > 0;
            if (m_paused && !single_step)
            {
                m_state = CorePaused;
                next_frame_due = nes_port_micros();
                nes_port_delay(20);
                continue;
            }

            if (!m_bus && !createCoreObjects())
            {
                m_prepare_level = 0;
                m_running = false;
                m_autorun = false;
                m_paused = true;
                m_step_frames = 0;
                break;
            }
            m_prepare_level = 0;

            const uint64_t frame_start = nes_port_micros();
            if (frame_start > next_frame_due + ((uint64_t)frame_us * 4u))
            {
                next_frame_due = frame_start;
            }
            setStage(StageFrameBegin, "[nes.so] frame begin");
            pollInput();
            if (m_bus)
            {
                m_bus->controller = (uint8_t)m_last_nes_mask;
                m_bus->clock();
                nes_port_yield();
                setStage(StageFrameClockDone, "[nes.so] frame clock done");
                String render_err;
                if (m_bus->consumeRenderFailure(&render_err))
                {
                    setError(render_err.length() > 0 ? render_err.c_str() : "nes display push failed", nullptr, 0);
                    break;
                }
                String audio_err;
                if (m_audio.consumeFailure(&audio_err))
                {
                    copy_text(m_audio_error,
                              sizeof(m_audio_error),
                              audio_err.length() > 0 ? audio_err.c_str() : "nes audio failed");
                    m_audio.end();
                }
            }
            m_frames++;
            if (single_step && m_step_frames > 0)
            {
                m_step_frames--;
            }
            if (!m_autorun && m_step_frames == 0)
            {
                m_paused = true;
                m_state = CorePaused;
            }
            else
            {
                m_state = CoreRunning;
            }
            setStage(StageFrameDone, "[nes.so] frame done");

            const uint64_t frame_end = nes_port_micros();
            next_frame_due += frame_us;
            if (frame_end < next_frame_due)
            {
                const uint32_t sleep_us = (uint32_t)(next_frame_due - frame_end);
                nes_port_delay(sleep_us / 1000u);
            }
            else
            {
                if (frame_end > next_frame_due + ((uint64_t)frame_us * 4u))
                {
                    next_frame_due = frame_end;
                }
                if (m_host && m_host->task.yield)
                {
                    m_host->task.yield();
                }
            }
        }

        releaseCoreObjects();
        m_running = false;
        m_stop_requested = false;
        m_autorun = false;
        m_paused = false;
        m_step_frames = 0;
        m_prepare_requested = false;
        m_prepare_result = 0;
        m_prepare_level = 0;
        m_stopped_ms = nes_port_millis();
        if (m_state != CoreError)
        {
            m_state = m_loaded ? CoreLoaded : CoreEmpty;
        }
        m_task_exited = true;

        (void)self_task;
        parkCurrentTask();
    }

    bool createCoreObjects()
    {
        nes_port_set_host(m_host);
        setStage(StageInitBegin, "[nes.so] init begin");
        releaseCoreObjects();

        setStage(StageCartridgeBegin, "[nes.so] cartridge begin");
        m_cartridge = new Cartridge(m_rom_path);
        if (!m_cartridge || !m_cartridge->ready())
        {
            const char *msg = m_cartridge ? m_cartridge->lastError().c_str() : "alloc cartridge failed";
            setError(msg && msg[0] ? msg : "load rom failed", nullptr, 0);
            releaseCoreObjects();
            return false;
        }
        m_mapper_id = m_cartridge->mapperId();
        setStage(StageCartridgeReady, "[nes.so] cartridge ready");
        if (m_prepare_level == 2)
        {
            m_loaded = true;
            return true;
        }

        m_video.init();
        nes::VideoSpec spec = {};
        spec.width = m_options.width;
        spec.height = m_options.height;
        spec.center_on_screen = false;
        spec.transfer_rows = m_options.transfer_rows;

        String err;
        beginAudioOutput();

        setStage(StageVideoBegin, "[nes.so] video begin");
        if (!m_video.begin(spec,
                           (int16_t)m_options.x,
                           (int16_t)m_options.y,
                           (BaseType_t)m_options.task_core,
                           (UBaseType_t)m_options.task_priority,
                           &err))
        {
            setError(err.length() > 0 ? err.c_str() : "nes display begin failed", nullptr, 0);
            return false;
        }
        setStage(StageVideoReady, "[nes.so] video ready");
        if (m_prepare_level == 1)
        {
            m_loaded = true;
            return true;
        }

        setStage(StageBusBegin, "[nes.so] bus begin");
        m_bus = new Bus();
        if (!m_bus)
        {
            setError("alloc bus failed", nullptr, 0);
            releaseCoreObjects();
            return false;
        }

        m_bus->setVideoOut(&m_video);
        m_bus->insertCartridge(m_cartridge);
        m_bus->cpu.apu.setAudioSink(audioSinkCallback, this);
        if (m_prepare_level == 3)
        {
            m_loaded = true;
            setStage(StageBusReady, "[nes.so] bus attached");
            return true;
        }

        setStage(StageBusResetBegin, "[nes.so] bus reset begin");
        const uint32_t reset_level = (m_prepare_level >= 4 && m_prepare_level <= 7) ? (m_prepare_level - 3) : 0;
        if (!m_bus->reset(reset_level))
        {
            setError("nes bus reset failed", nullptr, 0);
            releaseCoreObjects();
            return false;
        }
        m_bus->cpu.apu.setVolume(m_options.audio_volume_percent);
        if (m_options.audio_enabled && m_audio.active() && !startApuTask())
        {
            copy_text(m_audio_error, sizeof(m_audio_error), "create nes apu task failed");
            m_audio.end();
        }
        m_loaded = true;
        setStage(StageBusReady, "[nes.so] bus ready");
        return true;
    }

    void beginAudioOutput()
    {
        if (!m_options.audio_enabled)
        {
            return;
        }

        nes::audio::AudioSpec audio_spec = {};
        audio_spec.enabled = true;
        audio_spec.sample_rate = m_options.audio_sample_rate;
        audio_spec.bits_per_sample = m_options.audio_bits_per_sample;
        audio_spec.channels = m_options.audio_channels;
        audio_spec.queue_bytes = m_options.audio_queue_bytes;
        audio_spec.lua_fallback = m_options.audio_lua_fallback != 0;

        String audio_err;
        if (!m_audio.begin(audio_spec, &audio_err))
        {
            copy_text(m_audio_error,
                      sizeof(m_audio_error),
                      audio_err.length() > 0 ? audio_err.c_str() : "nes audio begin failed");
        }
        else
        {
            m_audio_error[0] = '\0';
        }
    }

    void releaseCoreObjects()
    {
        stopApuTask(500);
        if (m_bus)
        {
            m_bus->cpu.apu.setAudioSink(nullptr, nullptr);
            delete m_bus;
            m_bus = nullptr;
        }
        if (m_cartridge)
        {
            delete m_cartridge;
            m_cartridge = nullptr;
        }
        m_video.end();
        m_audio.end();
    }

    bool startApuTask()
    {
        stopApuTask(100);
        if (!m_host || !m_host->task.create || !m_bus)
        {
            return false;
        }

        void *task = nullptr;
        __atomic_store_n(&m_audio_apu_ticks, 0u, __ATOMIC_RELEASE);
        __atomic_store_n(&m_audio_sink_calls, 0u, __ATOMIC_RELEASE);
        __atomic_store_n(&m_audio_sink_frames, 0u, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_stop, false, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_exited, false, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_started, false, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_ret, MODULE_ERR_UNSUPPORTED, __ATOMIC_RELEASE);
        auto entry = reinterpret_cast<void (*)(void *)>(nes_port_exec_ptr(reinterpret_cast<const void *>(apuTaskEntry)));
        const int32_t audio_core = (m_options.task_core == 0) ? 1 : 0;
        const uint32_t audio_priority = (m_options.task_priority > 1) ? (m_options.task_priority - 1) : 1;
        const int32_t ret = m_host->task.create("nes_apu",
                                                entry,
                                                this,
                                                m_options.audio_task_stack_bytes,
                                                audio_priority,
                                                audio_core,
                                                &task);
        __atomic_store_n(&m_apu_task_ret, ret, __ATOMIC_RELEASE);
        if (ret != MODULE_OK || !task)
        {
            return false;
        }

        m_apu_task = task;
        return true;
    }

    void stopApuTask(uint32_t timeout_ms)
    {
        if (!m_apu_task)
        {
            __atomic_store_n(&m_apu_task_stop, false, __ATOMIC_RELEASE);
            __atomic_store_n(&m_apu_task_exited, false, __ATOMIC_RELEASE);
            return;
        }

        __atomic_store_n(&m_apu_task_stop, true, __ATOMIC_RELEASE);
        const uint32_t start_ms = nes_port_millis();
        while (!__atomic_load_n(&m_apu_task_exited, __ATOMIC_ACQUIRE) && (nes_port_millis() - start_ms) < timeout_ms)
        {
            nes_port_delay(1);
        }
        if (m_host && m_host->task.remove)
        {
            m_host->task.remove(m_apu_task);
        }
        m_apu_task = nullptr;
        __atomic_store_n(&m_apu_task_stop, false, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_exited, false, __ATOMIC_RELEASE);
        __atomic_store_n(&m_apu_task_started, false, __ATOMIC_RELEASE);
    }

    void handleAudioSamples(const int16_t *samples, size_t frames)
    {
        __atomic_add_fetch(&m_audio_sink_calls, 1u, __ATOMIC_RELEASE);
        __atomic_add_fetch(&m_audio_sink_frames, (uint32_t)frames, __ATOMIC_RELEASE);
        if (!m_audio.write(samples, frames) && m_audio_error[0] == '\0')
        {
            copy_text(m_audio_error, sizeof(m_audio_error), "nes audio write failed");
        }
    }

    void pollInput()
    {
        const uint32_t mask = __atomic_load_n(&m_input_mask, __ATOMIC_ACQUIRE);
        m_last_gamepad_mask = mask;
        m_last_nes_mask = sanitize_nes_mask(mask);
    }

    void setError(const char *text, char *err, size_t err_size)
    {
        copy_text(m_last_error, sizeof(m_last_error), text ? text : "nes failed");
        if (err && err_size > 0)
        {
            copy_text(err, err_size, m_last_error);
        }
        m_stage = StageError;
        m_state = CoreError;
    }

    void setStage(uint32_t stage, const char *text)
    {
        m_stage = stage;
        if (stage == StageFrameBegin || stage == StageFrameClockDone || stage == StageFrameDone)
        {
            return;
        }
        if (m_host && m_host->serial.println && text)
        {
            m_host->serial.println(text);
        }
    }

    void parkCurrentTask()
    {
        for (;;)
        {
            nes_port_delay(1000);
        }
    }

    const module_host_api_v1 *m_host = nullptr;
    nes_core_options_t m_options = {};
    char m_rom_path[MODULE_PATH_MAX] = {};
    char m_last_error[96] = {};
    char m_audio_error[64] = {};

    Bus *m_bus = nullptr;
    Cartridge *m_cartridge = nullptr;
    nes::video::NesVideoOut m_video;
    nes::audio::NesAudioOut m_audio;
    uint32_t m_audio_apu_ticks = 0;
    uint32_t m_audio_sink_calls = 0;
    uint32_t m_audio_sink_frames = 0;
    void *m_task = nullptr;
    void *m_apu_task = nullptr;

    volatile bool m_running = false;
    volatile bool m_stop_requested = false;
    volatile bool m_paused = false;
    volatile bool m_autorun = false;
    volatile bool m_task_exited = false;
    bool m_apu_task_stop = false;
    bool m_apu_task_exited = false;
    bool m_apu_task_started = false;
    int32_t m_apu_task_ret = MODULE_ERR_UNSUPPORTED;
    volatile bool m_prepare_requested = false;
    volatile uint32_t m_prepare_result = 0;
    volatile uint32_t m_prepare_level = 0;
    bool m_loaded = false;
    uint8_t m_mapper_id = 0;
    int32_t m_state = CoreEmpty;
    uint32_t m_frames = 0;
    uint32_t m_started_ms = 0;
    uint32_t m_stopped_ms = 0;
    uint32_t m_input_mask = 0;
    uint32_t m_last_gamepad_mask = 0;
    uint32_t m_last_nes_mask = 0;
    uint32_t m_task_stack_ptr = 0;
    volatile uint32_t m_step_frames = 0;
    volatile uint32_t m_stage = StageIdle;
    bool m_task_stack_psram = false;
};

} // namespace

extern "C" void *nes_core_create(const module_host_api_v1 *host)
{
    nes_port_set_host(host);
    return new NesCoreRuntime(host);
}

extern "C" void nes_core_destroy(void *runtime)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    delete core;
}

extern "C" int nes_core_start(void *runtime,
                              const char *rom_path,
                              const nes_core_options_t *options,
                              char *err,
                              size_t err_size)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    return core && core->start(rom_path, options, err, err_size) ? 1 : 0;
}

extern "C" int nes_core_stop(void *runtime, uint32_t timeout_ms, int force, char *err, size_t err_size)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    return !core || core->stop(timeout_ms, force != 0, err, err_size) ? 1 : 0;
}

extern "C" int nes_core_pause(void *runtime, int paused)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    if (!core)
    {
        return 0;
    }
    core->pause(paused != 0);
    return 1;
}

extern "C" int nes_core_prepare(void *runtime, uint32_t timeout_ms, uint32_t level, char *err, size_t err_size)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    return core && core->prepare(timeout_ms, level, err, err_size) ? 1 : 0;
}

extern "C" int nes_core_step(void *runtime, uint32_t frames, char *err, size_t err_size)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    return core && core->step(frames, err, err_size) ? 1 : 0;
}

extern "C" void nes_core_set_input_mask(void *runtime, uint32_t mask)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    if (core)
    {
        core->setInputMask(mask);
    }
}

extern "C" int nes_core_input(void *runtime, uint32_t *out_gamepad_mask, uint32_t *out_nes_mask)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    if (!core)
    {
        return 0;
    }
    core->input(out_gamepad_mask, out_nes_mask);
    return 1;
}

extern "C" void nes_core_status(void *runtime, nes_core_status_t *out)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    if (core)
    {
        core->status(out);
    }
    else if (out)
    {
        memset(out, 0, sizeof(*out));
    }
}

extern "C" size_t nes_core_read_audio(void *runtime, uint8_t *dst, size_t max_bytes)
{
    NesCoreRuntime *core = static_cast<NesCoreRuntime *>(runtime);
    return core ? core->readAudio(dst, max_bytes) : 0;
}
