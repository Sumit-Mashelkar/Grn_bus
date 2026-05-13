import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Single shared socket. Path matches the backend (server.py socketio_path).
// withCredentials is OFF — no auth/cookies are used by this MVP.
export const socket = io(BACKEND_URL, {
  path: "/api/socket.io",
  transports: ["websocket", "polling"],
  autoConnect: true,
});
