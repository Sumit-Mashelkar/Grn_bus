import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// withCredentials is OFF — this MVP has no auth/cookies, and turning it off lets
// the backend respond with CORS "*" or with an exact origin without browser
// preflight failures.
export const api = axios.create({
  baseURL: API,
});

export const get = (p, c) => api.get(p, c).then((r) => r.data);
export const post = (p, b, c) => api.post(p, b, c).then((r) => r.data);
