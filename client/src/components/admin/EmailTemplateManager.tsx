import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Eye, Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Template {
  id: string;
  name: string;
  description: string;
  filename: string;
  lastModified: string;
}

interface TemplateContent {
  success: boolean;
  content: string;
  templateId: string;
}

export default function EmailTemplateManager() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch templates list
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/templates'],
    queryFn: () => apiRequest('/api/templates'),
  });

  // Fetch individual template content
  const { data: templateContent, isLoading: contentLoading } = useQuery({
    queryKey: ['/api/templates', selectedTemplate],
    queryFn: () => selectedTemplate ? apiRequest(`/api/templates/${selectedTemplate}`) : null,
    enabled: !!selectedTemplate,
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: (data: { templateId: string; content: string }) =>
      apiRequest(`/api/templates/${data.templateId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: data.content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Template saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    },
  });

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    setIsEditing(false);
  };

  const handleEditStart = () => {
    setEditContent(templateContent?.content || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedTemplate) {
      saveTemplateMutation.mutate({
        templateId: selectedTemplate,
        content: editContent,
      });
    }
  };

  const handlePreview = async () => {
    if (!selectedTemplate) return;
    
    try {
      console.log('Calling preview endpoint for template:', selectedTemplate);
      
      // Fetch the processed preview content from the preview endpoint
      const response = await fetch(`/api/templates/${selectedTemplate}/preview`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Preview response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Failed to load preview: ${response.status} ${response.statusText}`);
      }
      
      const previewHtml = await response.text();
      console.log('Preview content received, length:', previewHtml.length);
      setPreviewContent(previewHtml);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Error loading template preview:', error);
      // Fallback to raw content if preview fails
      console.log('Using fallback raw content');
      setPreviewContent(templateContent?.content || '');
      setIsPreviewOpen(true);
    }
  };

  const handleSendTest = async () => {
    const email = prompt('Enter email address to send test email:');
    if (!email) return;
    
    try {
      const response = await fetch(`/api/templates/${selectedTemplate}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Test Email Sent",
          description: `Test email sent to ${email}. Check your inbox to verify logo display.`,
        });
      } else {
        toast({
          title: "Send Failed",
          description: result.error || 'Failed to send test email',
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Test email error:', error);
      toast({
        title: "Send Failed",
        description: "Failed to send test email",
        variant: "destructive",
      });
    }
  };

  if (templatesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="h-full">
      {/* Main Layout Container */}
      <div 
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: "24px",
          height: "600px",
          width: "100%",
          maxWidth: "100%",
          overflow: "hidden"
        }}
      >
        {/* Left Sidebar - Template List */}
        <div style={{ gridColumn: "1" }}>
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Email Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 overflow-y-auto max-h-[500px]">
              {templatesData?.templates?.map((template: Template) => (
                <div
                  key={template.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    selectedTemplate === template.id
                      ? "bg-purple-50 border-purple-200 shadow-sm"
                      : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300"
                  }`}
                  onClick={() => handleTemplateSelect(template.id)}
                >
                  <div className="font-medium text-sm text-gray-900">
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {template.description}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Modified: {new Date(template.lastModified).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Side - Template Editor/Viewer */}
        <div style={{ gridColumn: "2", minWidth: 0 }}>
          {selectedTemplate ? (
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {templatesData?.templates?.find((t: Template) => t.id === selectedTemplate)?.name}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePreview}
                      disabled={!templateContent?.content}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendTest}
                      disabled={!templateContent?.content}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send Test Email
                    </Button>
                    {!isEditing ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditStart}
                        disabled={contentLoading}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditing(false)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={saveTemplateMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[500px] overflow-hidden">
                {contentLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-gray-500">Loading template content...</div>
                  </div>
                ) : isEditing ? (
                  <textarea
                    className="w-full h-full p-4 border border-gray-300 rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edit template content..."
                  />
                ) : (
                  <div className="h-full border border-gray-200 rounded-md overflow-auto">
                    <iframe
                      srcDoc={templateContent?.content}
                      className="w-full h-full border-0"
                      title="Template Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex flex-col items-center justify-center h-full text-gray-500">
                <Mail size={48} className="mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  No Template Selected
                </h3>
                <p className="text-center max-w-md text-gray-500">
                  Select an email template from the list on the left to view and edit its content.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Template Preview</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPreviewOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 h-[600px] overflow-auto">
              <iframe
                srcDoc={previewContent}
                className="w-full h-full border border-gray-200 rounded"
                title="Template Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}