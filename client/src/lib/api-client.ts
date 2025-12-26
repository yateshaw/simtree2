/**
 * Helper function to make API requests with appropriate headers
 * @param url API endpoint to call
 * @param options Request options
 * @returns Response data
 */
async function apiRequest(url: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include cookies for session authentication
    mode: 'same-origin',
  });

  // Try to parse the response as JSON
  let data;
  try {
    data = await response.json();
  } catch (error) {
    // If response is not JSON, use text content
    data = { message: await response.text() };
  }

  // If the response is not ok, throw an error
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Unknown error');
    throw Object.assign(error, { status: response.status, data });
  }

  return data;
}

export default apiRequest;