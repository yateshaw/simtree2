import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Building, Shield, Calendar, Edit2, Save, X } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface UserProfileData {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: {
    id: number;
    name: string;
    companyName: string;
    industry?: string;
    verified: boolean;
    active: boolean;
  };
  createdAt: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });

  // Fetch user profile data
  const { data: profileData, isLoading } = useQuery<UserProfileData>({
    queryKey: ['/api/user/profile'],
    enabled: !!user,
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = () => {
    setEditData({
      firstName: profileData?.firstName || "",
      lastName: profileData?.lastName || "",
      phone: profileData?.phone || "",
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    updateProfileMutation.mutate(editData);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData({
      firstName: "",
      lastName: "",
      phone: "",
    });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground">
            Manage your account information and preferences
          </p>
        </div>

        <div className="grid gap-6">
          {/* Personal Information */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>
                  Your basic account details and contact information
                </CardDescription>
              </div>
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateProfileMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={profileData?.username || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={profileData?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  {isEditing ? (
                    <Input
                      id="firstName"
                      value={editData.firstName}
                      onChange={(e) => setEditData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="Enter first name"
                    />
                  ) : (
                    <Input
                      id="firstName"
                      value={profileData?.firstName || "Not provided"}
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  {isEditing ? (
                    <Input
                      id="lastName"
                      value={editData.lastName}
                      onChange={(e) => setEditData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Enter last name"
                    />
                  ) : (
                    <Input
                      id="lastName"
                      value={profileData?.lastName || "Not provided"}
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  {isEditing ? (
                    <Input
                      id="phone"
                      value={editData.phone}
                      onChange={(e) => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter phone number"
                    />
                  ) : (
                    <Input
                      id="phone"
                      value={profileData?.phone || "Not provided"}
                      disabled
                      className="bg-muted"
                    />
                  )}
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={profileData?.role === 'superadmin' ? 'destructive' : 'secondary'}>
                      <Shield className="h-3 w-3 mr-1" />
                      {profileData?.role || "Unknown"}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          {profileData?.company && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Company Information
                </CardTitle>
                <CardDescription>
                  Details about your associated company
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Company Name</Label>
                    <Input
                      value={profileData.company.companyName || profileData.company.name}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <Input
                      value={profileData.company.industry || "Not specified"}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div>
                    <Label>Company Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={profileData.company.active ? 'default' : 'secondary'}>
                        {profileData.company.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {profileData.company.verified && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>
                Account creation and activity details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Account Created</Label>
                  <Input
                    value={profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : "Unknown"}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div>
                  <Label>User ID</Label>
                  <Input
                    value={profileData?.id || "Unknown"}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Manage your account security and password
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Password</h4>
                    <p className="text-sm text-muted-foreground">
                      Change your account password
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Change Password
                    <small className="ml-2 text-xs">(Coming Soon)</small>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}