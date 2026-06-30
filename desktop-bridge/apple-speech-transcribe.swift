import AVFoundation
import Foundation
import Speech

struct Metadata: Decodable {
    let sampleRate: Double?
    let bits: Int?
    let channels: Int?
    let format: String?
}

struct Input: Decodable {
    let audio_base64: String
    let metadata: Metadata?
    let locale: String?
}

struct Output: Encodable {
    let transcript: String
}

struct ErrorOutput: Encodable {
    let error: String
}

func fail(_ message: String) -> Never {
    let payload = ErrorOutput(error: message)
    if let data = try? JSONEncoder().encode(payload),
       let text = String(data: data, encoding: .utf8) {
        FileHandle.standardError.write(Data((text + "\n").utf8))
    } else {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
    exit(1)
}

func readInput() -> Input {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    do {
        return try JSONDecoder().decode(Input.self, from: data)
    } catch {
        fail("invalid JSON stdin: \(error.localizedDescription)")
    }
}

func wavData(from pcm: Data, metadata: Metadata?) -> Data {
    let bits = metadata?.bits ?? 16
    let channels = metadata?.channels ?? 1
    let sampleRate = UInt32(metadata?.sampleRate ?? 16_000)
    if bits != 16 {
        fail("Apple Speech bridge currently supports 16-bit PCM only; got \(bits)")
    }
    if channels <= 0 || channels > 2 {
        fail("unsupported channel count: \(channels)")
    }

    var data = Data()
    let byteRate = sampleRate * UInt32(channels) * 2
    let blockAlign = UInt16(channels * 2)
    let riffSize = UInt32(36 + pcm.count)

    func appendString(_ value: String) {
        data.append(Data(value.utf8))
    }
    func appendUInt16(_ value: UInt16) {
        var little = value.littleEndian
        data.append(Data(bytes: &little, count: MemoryLayout<UInt16>.size))
    }
    func appendUInt32(_ value: UInt32) {
        var little = value.littleEndian
        data.append(Data(bytes: &little, count: MemoryLayout<UInt32>.size))
    }

    appendString("RIFF")
    appendUInt32(riffSize)
    appendString("WAVE")
    appendString("fmt ")
    appendUInt32(16)
    appendUInt16(1)
    appendUInt16(UInt16(channels))
    appendUInt32(sampleRate)
    appendUInt32(byteRate)
    appendUInt16(blockAlign)
    appendUInt16(16)
    appendString("data")
    appendUInt32(UInt32(pcm.count))
    data.append(pcm)
    return data
}

func requestSpeechAuthorization() {
    let semaphore = DispatchSemaphore(value: 0)
    var status: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    SFSpeechRecognizer.requestAuthorization { next in
        status = next
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 30)
    switch status {
    case .authorized:
        return
    case .denied:
        fail("speech recognition permission denied")
    case .restricted:
        fail("speech recognition is restricted on this Mac")
    case .notDetermined:
        fail("speech recognition permission was not granted")
    @unknown default:
        fail("unknown speech recognition authorization status")
    }
}

func transcribe(fileURL: URL, localeIdentifier: String) -> String {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)) else {
        fail("speech recognizer unavailable for locale \(localeIdentifier)")
    }
    if !recognizer.isAvailable {
        fail("speech recognizer is not currently available")
    }

    let request = SFSpeechURLRecognitionRequest(url: fileURL)
    request.shouldReportPartialResults = false
    if #available(macOS 13.0, *) {
        let requireOnDevice = ProcessInfo.processInfo.environment["APPLE_SPEECH_REQUIRE_ON_DEVICE"] ?? "0"
        request.requiresOnDeviceRecognition = ["1", "true", "yes", "on"].contains(requireOnDevice.lowercased())
    }

    var done = false
    var transcript = ""
    var failure: Error?

    let task = recognizer.recognitionTask(with: request) { result, error in
        if let result {
            transcript = result.bestTranscription.formattedString
            if result.isFinal {
                done = true
            }
        }
        if let error {
            failure = error
            done = true
        }
    }

    let deadline = Date().addingTimeInterval(45)
    while !done && Date() < deadline {
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
    }
    task.cancel()
    if !done {
        fail("speech recognition timed out")
    }
    if let failure {
        fail("speech recognition failed: \(failure.localizedDescription)")
    }
    if transcript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        fail("speech recognition returned empty transcript")
    }
    return transcript
}

let input = readInput()
guard let pcm = Data(base64Encoded: input.audio_base64) else {
    fail("audio_base64 is not valid base64")
}
let localeIdentifier = input.locale ?? ProcessInfo.processInfo.environment["APPLE_SPEECH_LOCALE"] ?? "zh-CN"
let tempDir = FileManager.default.temporaryDirectory
let fileURL = tempDir.appendingPathComponent("vibeboard-\(UUID().uuidString).wav")

do {
    try wavData(from: pcm, metadata: input.metadata).write(to: fileURL, options: .atomic)
    defer { try? FileManager.default.removeItem(at: fileURL) }
    requestSpeechAuthorization()
    let transcript = transcribe(fileURL: fileURL, localeIdentifier: localeIdentifier)
    let data = try JSONEncoder().encode(Output(transcript: transcript))
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    fail(error.localizedDescription)
}
