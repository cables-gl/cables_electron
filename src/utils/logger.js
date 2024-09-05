import { utilProvider, SharedLogger } from "cables-shared-api";
import log from "electron-log/main.js";

class Logger extends SharedLogger
{
    constructor(provider)
    {
        super(provider);
        const logFormat = "[electron-{processType}] {d}.{m}.{y} {h}:{i}:{s} {text}";
        log.transports.file.maxSize = 20 * 1024 * 1024;
        log.initialize();
        log.transports.console.format = logFormat;
        log.transports.file.format = logFormat;
        log.transports.ipc.level = "debug";

        this.loadStart = performance.now();
        this.startUpLog = [];
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
        log.error("[" + this._initiator + "]", "ERROR", args.join(" "), this._getContext(args));
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
        log.error("[" + this._initiator + "]", "UNCAUGHT", args.join(" "), this._getContext(args));
    }

    verbose(...args)
    {
        log.verbose("[" + this._initiator + "]", args.join(" "));
    }

    warn(...args)
    {
        log.warn("[" + this._initiator + "]", "WARN", args.join(" "));
    }

    event(...args)
    {
        log.verbose("[" + this._initiator + "]", args.join(" "));
    }

    logStartup(title)
    {
        const time = Math.round((performance.now() - this.loadStart) / 1000 * 100) / 100;
        this.startUpLog.push({
            "title": title,
            "time": time
        });
        this.debug(title + " (" + time + "s)");
    }
}

export default new Logger(utilProvider);
