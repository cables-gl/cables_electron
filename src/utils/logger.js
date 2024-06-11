import { utilProvider, SharedLogger } from "cables-shared-api";
import log from "electron-log/main.js";

class Logger extends SharedLogger
{
    constructor(provider)
    {
        super(provider);
        const logFormat = "[electron-{processType}] {d}:{m}:{y} {h}:{i}:{s} {text}";
        log.initialize();
        log.transports.console.format = logFormat;
        log.transports.file.format = logFormat;
        log.transports.ipc.level = "debug";
    }

    debug(...args)
    {
        log.debug("[" + this._initiator + "]", "DEBUG", args.join(" "));
    }

    endTime(...args)
    {
        super.endTime("[" + this._initiator + "]", args.join(" "));
    }

    error(...args)
    {
        log.error("[" + this._initiator + "]", "ERROR", args.join(" "), this._getContext());
    }

    info(...args)
    {
        log.info("[" + this._initiator + "]", args.join(" "));
    }

    startTime(...args)
    {
        super.startTime("[" + this._initiator + "]", "startTime", args.join(" "));
    }

    uncaught(...args)
    {
        log.error("[" + this._initiator + "]", "UNCAUGHT", args.join(" "), this._getContext());
    }

    verbose(...args)
    {
        log.verbose("[" + this._initiator + "]", args.join(" "));
    }

    warn(...args)
    {
        log.warn("[" + this._initiator + "]", "WARN", args.join(" "));
    }
}

export default new Logger(utilProvider);
