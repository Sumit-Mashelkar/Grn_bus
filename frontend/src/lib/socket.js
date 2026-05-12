import { io } from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Single shared socket. Path matches server.py socketio_path.
export const socket = io(BACKEND_URL, {
  path: "/api/socket.io",
  transports: ["websocket", "polling"],
  withCredentials: true,
  autoConnect: true,
});
