"""Domain errors raised by services, mapped to HTTP / MCP errors at the edges."""


class CortexError(Exception):
    status = 400

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFound(CortexError):
    status = 404


class Conflict(CortexError):
    status = 409


class Unauthorized(CortexError):
    status = 401


class Forbidden(CortexError):
    status = 403
