export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(
  response: Response,
  data: { error?: string } | null,
  fallback: string
) {
  if (data?.error) return data.error;
  return response.ok ? fallback : `${fallback} (${response.status})`;
}
