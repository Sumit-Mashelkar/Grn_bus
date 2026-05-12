import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const get = (p, c) => api.get(p, c).then((r) => r.data);
export const post = (p, b, c) => api.post(p, b, c).then((r) => r.data);
