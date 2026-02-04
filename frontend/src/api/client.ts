import axios from "axios";

const env = import.meta.env?.VITE_API_URL as string | undefined;

function guessBase(): string {
  return "";
}

const baseURL = env && env.trim().length > 0 ? env : guessBase();

export function isAbortedRequest(err: unknown): boolean {
  if (axios.isCancel(err)) return true;
  const code = (err as { code?: string })?.code;
  return code === "ECONNABORTED" || code === "ERR_CANCELED";
}

const api = axios.create({
  baseURL,
  withCredentials: false,
  timeout: 60000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (isAbortedRequest(err)) {
      return Promise.reject(err);
    }
    return Promise.reject(err);
  }
);

export default api;