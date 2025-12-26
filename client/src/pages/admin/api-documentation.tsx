import React from "react";
import { useAuth } from "@/hooks/use-auth";
import SadminLayout from "@/components/layout/SadminLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, Code, Database, Server, Wifi, Building, CreditCard, Activity } from "lucide-react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// API Endpoint interface for documentation
interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  parameters?: string;
  returns: string;
}

export default function ApiDocumentationPage() {
  const { user } = useAuth();
  const isSadminUser = user?.username === 'sadmin' && user?.isSuperAdmin;
  
  // Only super admins can access this page
  if (user && !user.isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[70vh]">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
          <Link href="/admin">
            <Button variant="outline">Return to Dashboard</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Auth APIs
  const authEndpoints: ApiEndpoint[] = [
    {
      method: "POST",
      path: "/api/auth/login",
      description: "User login with username/email and password",
      auth: "None",
      parameters: "{ username/email: string, password: string }",
      returns: "User object with auth token"
    },
    {
      method: "POST",
      path: "/api/auth/logout",
      description: "Logs out the current user",
      auth: "Required",
      returns: "Success message"
    },
    {
      method: "POST",
      path: "/api/auth/register",
      description: "Register a new user account",
      auth: "None",
      parameters: "{ username: string, email: string, password: string, companyId?: number }",
      returns: "User object"
    },
    {
      method: "POST",
      path: "/api/auth/verify-email/:token",
      description: "Verify a user's email with token",
      auth: "None",
      parameters: "token (URL parameter)",
      returns: "Success message"
    },
    {
      method: "POST",
      path: "/api/auth/request-password-reset",
      description: "Request a password reset link",
      auth: "None",
      parameters: "{ email: string }",
      returns: "Success message"
    },
    {
      method: "POST",
      path: "/api/auth/reset-password",
      description: "Reset password with token",
      auth: "None",
      parameters: "{ token: string, userId: number, password: string }",
      returns: "Success message"
    }
  ];

  // ESIM APIs
  const esimEndpoints: ApiEndpoint[] = [
    {
      method: "GET",
      path: "/api/esim/plans",
      description: "Get all available eSIM plans",
      auth: "Required",
      returns: "Array of eSIM plan objects"
    },
    {
      method: "GET",
      path: "/api/esim/plans/:id",
      description: "Get details of a specific eSIM plan",
      auth: "Required",
      parameters: "id (URL parameter)",
      returns: "eSIM plan object"
    },
    {
      method: "GET",
      path: "/api/esim/providers",
      description: "Get all eSIM providers",
      auth: "Required (SuperAdmin)",
      returns: "Array of provider objects"
    },
    {
      method: "GET",
      path: "/api/esim/purchased",
      description: "Get all purchased eSIMs for current user or employee",
      auth: "Required",
      returns: "Array of purchased eSIM objects"
    },
    {
      method: "POST",
      path: "/api/esim/purchase",
      description: "Purchase a new eSIM for an employee",
      auth: "Required",
      parameters: "{ planId: number, employeeId: number }",
      returns: "Purchased eSIM object"
    },
    {
      method: "POST",
      path: "/api/esim/activate/:id",
      description: "Activate a purchased eSIM",
      auth: "Required",
      parameters: "id (URL parameter)",
      returns: "Updated eSIM object"
    },
    {
      method: "GET",
      path: "/api/esim/usage/:id",
      description: "Get usage statistics for an eSIM",
      auth: "Required",
      parameters: "id (URL parameter)",
      returns: "eSIM usage object"
    }
  ];

  // Company and Employee APIs
  const companyEndpoints: ApiEndpoint[] = [
    {
      method: "GET",
      path: "/api/companies",
      description: "Get all companies (admin only)",
      auth: "Required (Admin)",
      returns: "Array of company objects"
    },
    {
      method: "GET",
      path: "/api/companies/:id",
      description: "Get details of a specific company",
      auth: "Required (Admin or Company Member)",
      parameters: "id (URL parameter)",
      returns: "Company object"
    },
    {
      method: "POST",
      path: "/api/companies",
      description: "Create a new company",
      auth: "Required (SuperAdmin)",
      parameters: "Company object data",
      returns: "Created company object"
    },
    {
      method: "PATCH",
      path: "/api/companies/:id",
      description: "Update company information",
      auth: "Required (Admin or Company Admin)",
      parameters: "id (URL parameter), Company update data",
      returns: "Updated company object"
    },
    {
      method: "GET",
      path: "/api/employees",
      description: "Get all employees for current company or all if superadmin",
      auth: "Required",
      returns: "Array of employee objects"
    },
    {
      method: "POST",
      path: "/api/employees",
      description: "Create a new employee",
      auth: "Required (Admin)",
      parameters: "Employee object data",
      returns: "Created employee object"
    },
    {
      method: "GET",
      path: "/api/employees/:id",
      description: "Get details of a specific employee",
      auth: "Required",
      parameters: "id (URL parameter)",
      returns: "Employee object"
    },
    {
      method: "PATCH",
      path: "/api/employees/:id",
      description: "Update employee information",
      auth: "Required (Admin)",
      parameters: "id (URL parameter), Employee update data",
      returns: "Updated employee object"
    }
  ];

  // Wallet and Payment APIs
  const walletEndpoints: ApiEndpoint[] = [
    {
      method: "GET",
      path: "/api/wallet",
      description: "Get wallet details for current user",
      auth: "Required",
      returns: "Wallet object"
    },
    {
      method: "POST",
      path: "/api/wallet/topup",
      description: "Add funds to wallet",
      auth: "Required",
      parameters: "{ amount: number, paymentMethodId?: string }",
      returns: "Updated wallet object and payment intent"
    },
    {
      method: "GET",
      path: "/api/wallet/transactions",
      description: "Get wallet transactions history",
      auth: "Required",
      returns: "Array of transaction objects"
    },
    {
      method: "POST",
      path: "/api/payment/create-intent",
      description: "Create a payment intent for Stripe",
      auth: "Required",
      parameters: "{ amount: number, currency: string }",
      returns: "Stripe payment intent"
    },
    {
      method: "POST",
      path: "/api/payment/confirm",
      description: "Confirm a payment intent",
      auth: "Required",
      parameters: "{ paymentIntentId: string }",
      returns: "Confirmation result"
    }
  ];

  // Maintenance APIs
  const maintenanceEndpoints: ApiEndpoint[] = [
    {
      method: "GET",
      path: "/api/maintenance/connections",
      description: "Get all service connection statuses",
      auth: "Required (SuperAdmin)",
      returns: "Array of connection objects"
    },
    {
      method: "GET",
      path: "/api/maintenance/service-statuses",
      description: "Get current service statuses",
      auth: "Required (SuperAdmin)",
      returns: "Object with service status data"
    },
    {
      method: "POST",
      path: "/api/maintenance/connections/check/:service",
      description: "Check a specific service connection",
      auth: "Required (SuperAdmin)",
      parameters: "service (URL parameter)",
      returns: "Connection check result"
    },
    {
      method: "GET",
      path: "/api/maintenance/connection-logs",
      description: "Get connection logs",
      auth: "Required (SuperAdmin)",
      returns: "Array of connection log objects"
    },
    {
      method: "GET",
      path: "/api/maintenance/connection-logs/:service",
      description: "Get connection logs for a specific service",
      auth: "Required (SuperAdmin)",
      parameters: "service (URL parameter)",
      returns: "Array of connection log objects for the service"
    }
  ];

  // Render API endpoint table
  const renderEndpointsTable = (endpoints: ApiEndpoint[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Method</TableHead>
          <TableHead className="w-[250px]">Endpoint</TableHead>
          <TableHead className="w-[300px]">Description</TableHead>
          <TableHead className="w-[100px]">Auth</TableHead>
          <TableHead className="w-[250px]">Parameters</TableHead>
          <TableHead className="w-[250px]">Returns</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {endpoints.map((endpoint, index) => (
          <TableRow key={index}>
            <TableCell className={`font-mono font-medium ${
              endpoint.method === 'GET' ? 'text-blue-600' : 
              endpoint.method === 'POST' ? 'text-green-600' :
              endpoint.method === 'PATCH' ? 'text-amber-600' :
              endpoint.method === 'DELETE' ? 'text-red-600' : ''
            }`}>
              {endpoint.method}
            </TableCell>
            <TableCell className="font-mono">{endpoint.path}</TableCell>
            <TableCell>{endpoint.description}</TableCell>
            <TableCell>{endpoint.auth}</TableCell>
            <TableCell className="font-mono text-xs">
              {endpoint.parameters || "None"}
            </TableCell>
            <TableCell className="font-mono text-xs">{endpoint.returns}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const renderContent = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 sm:p-6 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            API Documentation
          </h1>
        </div>
        <Link href="/admin-maintenance">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to Maintenance
          </Button>
        </Link>
      </div>
      
      <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <FileText size={20} />
            REST API Reference
          </CardTitle>
          <CardDescription>
            Comprehensive documentation of all available API endpoints in the system.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="mb-6 p-4 bg-gray-50 rounded-md">
            <h3 className="text-lg font-medium text-gray-900 mb-2">API Base URL</h3>
            <code className="block p-3 bg-gray-100 text-gray-800 rounded font-mono">
              https://simtreeapp.replit.app/api
            </code>
            <p className="mt-3 text-gray-600">
              All API requests must include the following headers:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li className="font-mono">Authorization: Bearer &lt;token&gt; <span className="text-gray-500 font-normal">(for authenticated endpoints)</span></li>
              <li className="font-mono">Content-Type: application/json</li>
              <li className="font-mono">Accept: application/json</li>
            </ul>
          </div>

          <Tabs defaultValue="auth" className="w-full">
            <TabsList className="grid grid-cols-5 mb-4">
              <TabsTrigger value="auth" className="text-sm">
                Authentication
              </TabsTrigger>
              <TabsTrigger value="esim" className="text-sm">
                eSIM Management
              </TabsTrigger>
              <TabsTrigger value="company" className="text-sm">
                Company & Employees
              </TabsTrigger>
              <TabsTrigger value="wallet" className="text-sm">
                Wallet & Payments
              </TabsTrigger>
              <TabsTrigger value="maintenance" className="text-sm">
                Maintenance
              </TabsTrigger>
            </TabsList>

            <TabsContent value="auth" className="overflow-x-auto">
              <div className="pb-3 mb-3 border-b">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Server size={18} />
                  Authentication API
                </h3>
                <p className="text-gray-600 mt-1">Endpoints for user authentication, registration, and account management</p>
              </div>
              {renderEndpointsTable(authEndpoints)}
            </TabsContent>

            <TabsContent value="esim" className="overflow-x-auto">
              <div className="pb-3 mb-3 border-b">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Wifi size={18} />
                  eSIM Management API
                </h3>
                <p className="text-gray-600 mt-1">Endpoints for eSIM plans, purchases, activations and usage tracking</p>
              </div>
              {renderEndpointsTable(esimEndpoints)}
            </TabsContent>

            <TabsContent value="company" className="overflow-x-auto">
              <div className="pb-3 mb-3 border-b">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Building size={18} />
                  Company & Employee API
                </h3>
                <p className="text-gray-600 mt-1">Endpoints for company and employee management</p>
              </div>
              {renderEndpointsTable(companyEndpoints)}
            </TabsContent>

            <TabsContent value="wallet" className="overflow-x-auto">
              <div className="pb-3 mb-3 border-b">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <CreditCard size={18} />
                  Wallet & Payment API
                </h3>
                <p className="text-gray-600 mt-1">Endpoints for wallet management and payment processing</p>
              </div>
              {renderEndpointsTable(walletEndpoints)}
            </TabsContent>

            <TabsContent value="maintenance" className="overflow-x-auto">
              <div className="pb-3 mb-3 border-b">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Activity size={18} />
                  Maintenance API
                </h3>
                <p className="text-gray-600 mt-1">Endpoints for system maintenance and monitoring</p>
              </div>
              {renderEndpointsTable(maintenanceEndpoints)}
            </TabsContent>
          </Tabs>

          <div className="mt-8 p-4 bg-blue-50 rounded-md">
            <h3 className="text-lg font-medium text-blue-900 mb-2">Error Handling</h3>
            <p className="text-blue-700 mb-2">All API endpoints follow consistent error response patterns:</p>
            <div className="bg-white p-3 rounded shadow-sm">
              <code className="block text-sm font-mono whitespace-pre overflow-x-auto text-blue-800">
{`{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { /* Additional error details */ }
  }
}`}
              </code>
            </div>
            
            <h4 className="font-medium mt-4 mb-2 text-blue-900">Common Error Codes</h4>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li><span className="font-mono text-blue-800">AUTH_REQUIRED</span> - Authentication is required</li>
              <li><span className="font-mono text-blue-800">INVALID_CREDENTIALS</span> - Invalid username/password</li>
              <li><span className="font-mono text-blue-800">FORBIDDEN</span> - Insufficient permissions</li>
              <li><span className="font-mono text-blue-800">NOT_FOUND</span> - Resource not found</li>
              <li><span className="font-mono text-blue-800">VALIDATION_ERROR</span> - Invalid input parameters</li>
              <li><span className="font-mono text-blue-800">INSUFFICIENT_FUNDS</span> - Insufficient wallet balance</li>
              <li><span className="font-mono text-blue-800">SERVICE_UNAVAILABLE</span> - External service unavailable</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Code size={20} />
            API Integration Examples
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <Tabs defaultValue="javascript" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>

            <TabsContent value="javascript">
              <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm overflow-x-auto">
                <pre>{`// Example: Login and fetch user's wallet
const API_BASE_URL = 'https://api.esimplatform.com/v1';

// Authentication
async function login(username, password) {
  try {
    const response = await fetch(\`\${API_BASE_URL}/api/auth/login\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error.message);
    }
    
    // Store token
    localStorage.setItem('token', data.token);
    return data.user;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

// Fetch wallet details
async function getWallet() {
  try {
    const token = localStorage.getItem('token');
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    const response = await fetch(\`\${API_BASE_URL}/api/wallet\`, {
      headers: {
        'Authorization': \`Bearer \${token}\`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error.message);
    }
    
    return data.wallet;
  } catch (error) {
    console.error('Failed to fetch wallet:', error);
    throw error;
  }
}

// Usage
async function example() {
  try {
    const user = await login('username', 'password');
    if (import.meta.env.DEV) { console.log('Logged in as:', user.username); }
    
    const wallet = await getWallet();
    if (import.meta.env.DEV) { console.log('Wallet balance:', wallet.balance); }
  } catch (error) {
    console.error('Example failed:', error);
  }
}`}</pre>
              </div>
            </TabsContent>

            <TabsContent value="python">
              <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm overflow-x-auto">
                <pre>{`# Example: Purchasing an eSIM in Python
import requests

API_BASE_URL = 'https://api.esimplatform.com/v1'
token = None

def login(username, password):
    global token
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/auth/login",
            json={"username": username, "password": password},
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        )
        
        data = response.json()
        
        if not data.get('success'):
            raise Exception(data.get('error', {}).get('message', 'Login failed'))
        
        # Store token
        token = data.get('token')
        return data.get('user')
    except Exception as e:
        print(f"Login failed: {str(e)}")
        raise

def purchase_esim(plan_id, employee_id):
    if not token:
        raise Exception("Authentication required")
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/esim/purchase",
            json={"planId": plan_id, "employeeId": employee_id},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        )
        
        data = response.json()
        
        if not data.get('success'):
            raise Exception(data.get('error', {}).get('message', 'Purchase failed'))
        
        return data.get('esim')
    except Exception as e:
        print(f"eSIM purchase failed: {str(e)}")
        raise

# Example usage
def main():
    try:
        user = login("username", "password")
        print(f"Logged in as: {user.get('username')}")
        
        # Purchase an eSIM
        esim = purchase_esim(plan_id=123, employee_id=456)
        print(f"eSIM purchased: {esim.get('iccid')}")
        print(f"Activation Code: {esim.get('activationCode')}")
    except Exception as e:
        print(f"Example failed: {str(e)}")

if __name__ == "__main__":
    main()`}</pre>
              </div>
            </TabsContent>

            <TabsContent value="curl">
              <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm overflow-x-auto">
                <pre>{`# Login
curl -X POST https://api.esimplatform.com/v1/api/auth/login \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"username": "username", "password": "password"}'

# Store token in variable (bash)
TOKEN=$(curl -s -X POST https://api.esimplatform.com/v1/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "username", "password": "password"}' | jq -r '.token')

# Get available eSIM plans
curl -X GET https://api.esimplatform.com/v1/api/esim/plans \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Accept: application/json"

# Purchase an eSIM
curl -X POST https://api.esimplatform.com/v1/api/esim/purchase \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"planId": 123, "employeeId": 456}'

# Get wallet balance
curl -X GET https://api.esimplatform.com/v1/api/wallet \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Accept: application/json"`}</pre>
              </div>
            </TabsContent>
          </Tabs>
          
          <div className="mt-6 p-4 bg-indigo-50 rounded-md">
            <h3 className="text-lg font-medium text-indigo-900 mb-2">API Client Libraries</h3>
            <p className="text-indigo-700 mb-4">We provide official client libraries for easy API integration:</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-100">
                <h4 className="font-medium text-indigo-800 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"></path>
                    <line x1="8" y1="16" x2="8.01" y2="16"></line>
                    <line x1="8" y1="20" x2="8.01" y2="20"></line>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                    <line x1="12" y1="22" x2="12.01" y2="22"></line>
                    <line x1="16" y1="16" x2="16.01" y2="16"></line>
                    <line x1="16" y1="20" x2="16.01" y2="20"></line>
                  </svg>
                  JavaScript/TypeScript
                </h4>
                <code className="block text-xs bg-gray-50 p-2 rounded mb-2 font-mono">npm install @esimplatform/api-client</code>
                <a href="#" className="text-sm text-indigo-600 hover:underline">View on GitHub</a>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-100">
                <h4 className="font-medium text-indigo-800 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9H7.5a2.5 2.5 0 0 1 0-5H12m0 12H7.5a2.5 2.5 0 0 0 0 5H12m0-17v17m0 0h4.5a2.5 2.5 0 0 0 0-5H12m0-7h4.5a2.5 2.5 0 0 1 0 5H12"></path>
                  </svg>
                  Python
                </h4>
                <code className="block text-xs bg-gray-50 p-2 rounded mb-2 font-mono">pip install esimplatform-api</code>
                <a href="#" className="text-sm text-indigo-600 hover:underline">View on GitHub</a>
              </div>
              
              <div className="bg-white p-4 rounded-lg shadow-sm border border-indigo-100">
                <h4 className="font-medium text-indigo-800 mb-2 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 18 22 12 16 6"></path>
                    <path d="M8 6 2 12 8 18"></path>
                  </svg>
                  Go
                </h4>
                <code className="block text-xs bg-gray-50 p-2 rounded mb-2 font-mono">go get github.com/esimplatform/api-go</code>
                <a href="#" className="text-sm text-indigo-600 hover:underline">View on GitHub</a>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Database size={20} />
            Data Models
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <p className="text-gray-700 mb-4">
            This section describes the core data models returned by the API.
            Understanding these models is essential for effective API integration.
          </p>
          
          <Tabs defaultValue="user" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="user">User & Company</TabsTrigger>
              <TabsTrigger value="esim">eSIM & Plans</TabsTrigger>
              <TabsTrigger value="wallet">Wallet & Transactions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="user">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">User Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 123,
  "username": "john.doe",
  "email": "john.doe@company.com",
  "role": "admin", // "user", "admin", "superadmin"
  "isAdmin": true,
  "isSuperAdmin": false,
  "companyId": 456,
  "isVerified": true,
  "createdAt": "2025-02-14T12:34:56Z"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Company Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 456,
  "name": "Acme Corporation",
  "taxNumber": "TAX123456",
  "address": "123 Business Ave",
  "country": "United States",
  "entityType": "Corporation",
  "contactName": "Jane Smith",
  "contactPhone": "+15551234567",
  "contactEmail": "contact@acmecorp.com",
  "verified": true,
  "active": true,
  "logo": "https://api.esimplatform.com/logos/acme.png",
  "website": "https://acmecorp.com",
  "industry": "Technology",
  "createdAt": "2025-01-01T00:00:00Z"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Employee Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 789,
  "companyId": 456,
  "name": "Robert Johnson",
  "email": "robert.j@acmecorp.com",
  "phone": "+15559876543",
  "department": "Sales",
  "position": "Regional Manager",
  "active": true,
  "currentPlanId": 101,
  "notes": "VIP employee, premium support",
  "createdAt": "2025-02-15T10:20:30Z"
}`}</pre>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="esim">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">eSIM Plan Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 101,
  "providerId": "CKH999",
  "name": "Global Traveler 5GB",
  "description": "5GB data valid for 30 days",
  "data": "5.00",
  "dataUnit": "GB",
  "validity": 30,
  "price": 29.99,
  "currency": "USD",
  "countries": ["us", "ca", "mx", "gb", "fr", "de"],
  "available": true,
  "popular": true,
  "features": ["Data rollover", "4G/LTE", "Tethering"],
  "createdAt": "2025-01-15T00:00:00Z"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Purchased eSIM Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 5001,
  "employeeId": 789,
  "planId": 101,
  "orderId": "B25051022160004",
  "iccid": "8943108170002289259",
  "activationCode": "LPA:1$rsp-eu.simlessly.com$CODE",
  "qrCode": "https://p.qrsim.net/code.png",
  "status": "activated", // or "waiting_for_activation", "cancelled"
  "purchaseDate": "2025-05-10T22:16:49.676Z",
  "activationDate": "2025-05-11T08:30:15.123Z",
  "expiryDate": "2025-06-10T08:30:15.123Z",
  "dataUsed": "2.15", // GB
  "metadata": {
    // Additional provider-specific data
  }
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Provider Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": "CKH999",
  "name": "Global Connect",
  "description": "Global eSIM provider with coverage in 190+ countries",
  "website": "https://globalconnect.com",
  "supportEmail": "support@globalconnect.com",
  "supportPhone": "+15551234567",
  "countries": ["us", "ca", "mx", "gb", "fr", "de", "..."],
  "active": true,
  "apiEndpoint": "https://api.globalconnect.com/v2",
  "createdAt": "2025-01-01T00:00:00Z"
}`}</pre>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="wallet">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">Wallet Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": 123,
  "userId": 456,
  "companyId": 789,
  "balance": 250.75,
  "currency": "USD",
  "status": "active", // or "suspended", "closed"
  "lastTopupDate": "2025-05-01T10:15:30.123Z",
  "lastTopupAmount": 100.00,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-05-01T10:15:30.123Z"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Transaction Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": "txn_123456789",
  "walletId": 123,
  "userId": 456,
  "type": "topup", // or "purchase", "refund"
  "amount": 100.00,
  "currency": "USD",
  "status": "completed", // or "pending", "failed"
  "referenceId": "pi_12345", // Stripe payment intent ID
  "metadata": {
    "paymentMethod": "card",
    "last4": "4242",
    "brand": "visa"
  },
  "description": "Wallet top-up",
  "createdAt": "2025-05-01T10:15:30.123Z"
}`}</pre>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">Payment Intent Model</h3>
                  <div className="bg-gray-900 text-gray-100 p-4 rounded-md font-mono text-sm">
                    <pre>{`{
  "id": "pi_12345",
  "clientSecret": "pi_12345_secret_67890",
  "amount": 10000, // in cents
  "currency": "usd",
  "status": "requires_payment_method", // or other Stripe statuses
  "created": 1619745600, // Unix timestamp
  "metadata": {
    "walletId": "123",
    "userId": "456"
  }
}`}</pre>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );

  return isSadminUser ? (
    <SadminLayout>
      {renderContent()}
    </SadminLayout>
  ) : (
    <DashboardLayout>
      {renderContent()}
    </DashboardLayout>
  );
}