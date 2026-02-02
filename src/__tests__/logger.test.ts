/**
 * Tests for Logger and ContextLogger
 */

import { Logger, ContextLogger } from "../logger";

describe("Logger", () => {
	beforeEach(() => {
		jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "warn").mockImplementation(() => {});
		jest.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		Logger.setDebugMode(false);
	});

	describe("setDebugMode", () => {
		it("should set debug mode", () => {
			Logger.setDebugMode(true);
			Logger.debug("test");
			expect(console.log).toHaveBeenCalled();
			jest.clearAllMocks();
			Logger.setDebugMode(false);
			Logger.debug("test");
			expect(console.log).not.toHaveBeenCalled();
		});
	});

	describe("getErrorMessage", () => {
		it("should return message for Error", () => {
			expect(Logger.getErrorMessage(new Error("err"))).toBe("err");
		});
		it("should return string as-is", () => {
			expect(Logger.getErrorMessage("str")).toBe("str");
		});
		it("should return message property from object", () => {
			expect(Logger.getErrorMessage({ message: "obj msg" })).toBe("obj msg");
		});
		it("should return JSON for object without message", () => {
			expect(Logger.getErrorMessage({ code: 1 })).toBe('{"code":1}');
		});
		it("should return String for other types", () => {
			expect(Logger.getErrorMessage(42)).toBe("42");
		});
	});

	describe("getErrorDetails", () => {
		it("should return message and stack for Error", () => {
			const err = new Error("e");
			const details = Logger.getErrorDetails(err);
			expect(details.message).toBe("e");
			expect(details.stack).toBeDefined();
		});
		it("should return message only for non-Error", () => {
			expect(Logger.getErrorDetails("x")).toEqual({ message: "x" });
		});
	});

	describe("error", () => {
		it("should log when only message", () => {
			Logger.error("msg");
			expect(console.error).toHaveBeenCalledWith("[Zettelkasten] ERROR: msg");
		});
		it("should log message and error when error provided", () => {
			Logger.error("msg", new Error("err"));
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe("warn", () => {
		it("should call console.warn", () => {
			Logger.warn("w");
			expect(console.warn).toHaveBeenCalledWith("[Zettelkasten] WARN: w");
		});
	});

	describe("info", () => {
		it("should call console.log", () => {
			Logger.info("i");
			expect(console.log).toHaveBeenCalledWith("[Zettelkasten] INFO: i");
		});
	});

	describe("http", () => {
		it("should log when debug mode on", () => {
			Logger.setDebugMode(true);
			Logger.http("h");
			expect(console.log).toHaveBeenCalledWith("[Zettelkasten] HTTP: h");
		});
		it("should not log when debug mode off", () => {
			Logger.http("h");
			expect(console.log).not.toHaveBeenCalled();
		});
	});

	describe("debug", () => {
		it("should log when debug mode on", () => {
			Logger.setDebugMode(true);
			Logger.debug("d");
			expect(console.log).toHaveBeenCalledWith("[Zettelkasten] DEBUG: d");
		});
		it("should not log when debug mode off", () => {
			Logger.debug("d");
			expect(console.log).not.toHaveBeenCalled();
		});
	});

	describe("logError", () => {
		it("should call error and optionally Notice", () => {
			Logger.logError("ctx", new Error("e"), false);
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe("createLogger", () => {
		it("should return ContextLogger instance", () => {
			const ctx = Logger.createLogger("Test");
			expect(ctx).toBeInstanceOf(ContextLogger);
		});
	});
});

describe("ContextLogger", () => {
	let ctx: ContextLogger;

	beforeEach(() => {
		jest.spyOn(console, "error").mockImplementation(() => {});
		jest.spyOn(console, "warn").mockImplementation(() => {});
		jest.spyOn(console, "log").mockImplementation(() => {});
		ctx = Logger.createLogger("Ctx");
	});

	afterEach(() => {
		jest.restoreAllMocks();
		Logger.setDebugMode(false);
	});

	describe("error", () => {
		it("should log with context", () => {
			ctx.error("msg");
			expect(console.error).toHaveBeenCalled();
		});
		it("should log with error", () => {
			ctx.error("msg", new Error("e"));
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe("warn", () => {
		it("should log with context", () => {
			ctx.warn("w");
			expect(console.warn).toHaveBeenCalled();
		});
	});

	describe("info", () => {
		it("should log with context", () => {
			ctx.info("i");
			expect(console.log).toHaveBeenCalled();
		});
	});

	describe("http", () => {
		it("should log when debug on", () => {
			Logger.setDebugMode(true);
			ctx.http("h");
			expect(console.log).toHaveBeenCalled();
		});
	});

	describe("debug", () => {
		it("should log when debug on", () => {
			Logger.setDebugMode(true);
			ctx.debug("d");
			expect(console.log).toHaveBeenCalled();
		});
	});

	describe("logError", () => {
		it("should call error", () => {
			ctx.logError("ctx", new Error("e"), false);
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe("getErrorMessage", () => {
		it("should delegate to Logger.getErrorMessage", () => {
			expect(ctx.getErrorMessage(new Error("x"))).toBe("x");
		});
	});
});
