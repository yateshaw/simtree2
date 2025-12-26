import { QueryClient } from "@tanstack/react-query";

export async function throwIfNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage;
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || `HTTP error ${res.status}`;
    } catch {
      errorMessage = `HTTP error ${res.status}`;
    }
    throw new Error(errorMessage);
  }
  return res;
}

export const apiRequest = async <T = any>(url: string, options: RequestInit = {}): Promise<T> => {
  const { method = 'GET', body, headers = {} } = options;

  // Add special debugging for template-related requests
  const isTemplateEndpoint = url.includes('/templates/');
  if (isTemplateEndpoint) {
    if (import.meta.env.DEV) { console.log(`API Request to templates endpoint: ${url}`); }
    if (import.meta.env.DEV) { console.log(`Method: ${method}`); }
    if (import.meta.env.DEV) { console.log(`Body length: ${body ? (typeof body === 'string' ? body.length : JSON.stringify(body).length) : 0} bytes`); }
  }

  try {
    const fullUrl = url.startsWith('http') ? url : url.startsWith('/api') ? url : `/api${url}`;
    
    if (isTemplateEndpoint) {
      if (import.meta.env.DEV) { console.log(`Full URL: ${fullUrl}`); }
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(headers as Record<string, string>)
    };

    // Add CSRF token for non-GET requests
    if (method !== 'GET') {
      try {
        const csrfResponse = await fetch('/api/csrf-token', {
          method: 'GET',
          credentials: 'include'
        });
        if (csrfResponse.ok) {
          const csrfData = await csrfResponse.json();
          if (csrfData.csrfToken) {
            requestHeaders['X-CSRF-Token'] = csrfData.csrfToken;
          }
        }
      } catch (csrfError) {
        console.warn('Failed to fetch CSRF token:', csrfError);
        // Continue with request - server will handle missing token
      }
    }
    
    const res = await fetch(fullUrl, {
      method,
      headers: requestHeaders,
      body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
      credentials: "include", // Always include credentials
    });

    if (isTemplateEndpoint) {
      if (import.meta.env.DEV) { console.log(`Response status: ${res.status} ${res.statusText}`); }
      // Create headers object safely without iterator
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      if (import.meta.env.DEV) { console.log(`Response headers:`, headers); }
    }

    // Handle unauthorized
    if (res.status === 401) {
      if (isTemplateEndpoint) console.error('Unauthorized response for template endpoint');
      throw new Error('Unauthorized');
    }

    // Check for other errors
    try {
      await throwIfNotOk(res.clone());
    } catch (error) {
      if (isTemplateEndpoint) {
        console.error(`Error response from template endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      throw error;
    }

    // Handle empty responses
    if (res.status === 204) {
      return { success: true } as T;
    }

    //Check for HTML response
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const text = await res.text();
      console.error('Received HTML response instead of JSON:', text.substring(0, 100) + '...');
      console.error('Request URL:', res.url);
      console.error('Status:', res.status, res.statusText);
      
      // Create headers object safely
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.error('Headers:', headers);
      
      throw new Error(`Server error (${res.status}): The server returned an HTML page instead of JSON data. Please try again later.`);
    }

    // Parse JSON response
    const text = await res.text();
    
    if (isTemplateEndpoint) {
      if (import.meta.env.DEV) { console.log(`Response body length: ${text ? text.length : 0} bytes`); }
      if (text) {
        if (import.meta.env.DEV) { console.log(`Response starts with: ${text.substring(0, 50)}...`); }
      }
    }
    
    if (!text) {
      return { success: true } as T;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse JSON response:', text);
      console.error('Parse error:', error);
      throw new Error('Invalid JSON response');
    }
  } catch (error) {
    if (isTemplateEndpoint) {
      console.error(`Template API request failed:`, error);
    }
    
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error');
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false, // Don't refetch when switching tabs
      staleTime: 60000, // Data is fresh for 1 minute
      gcTime: 300000, // Keep data in cache for 5 minutes
      queryFn: async ({ queryKey }) => {
        const [url] = queryKey as [string];
        return apiRequest(url);
      },
    },
  },
});