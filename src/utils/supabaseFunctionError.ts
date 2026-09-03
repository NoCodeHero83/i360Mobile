export async function getSupabaseFunctionErrorDetail(error: unknown) {
  const fallbackMessage =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const maybeError = error as {
    name?: string;
    message?: string;
    context?: Response;
  };
  const response = maybeError?.context;

  if (!response || typeof response.text !== "function") {
    return {
      name: maybeError?.name,
      message: maybeError?.message ?? fallbackMessage,
    };
  }

  let body: unknown;
  try {
    const text = await response.clone().text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } catch {
    body = undefined;
  }

  return {
    name: maybeError?.name,
    message: maybeError?.message ?? fallbackMessage,
    status: response.status,
    statusText: response.statusText,
    body,
  };
}