import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '../../components/ui/spinner';
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Check,
  RefreshCw,
  Eye,
  Mail,
  Save,
  AlertTriangle,
  X,
  Image,
  Layout,
  Type,
  PenTool,
  Code,
  Square,
  TextIcon,
  MoveIcon,
  RotateCw,
  RotateCcw,
  MoveUp,
  MoveDown,
  Copy
} from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { apiRequest } from '@/lib/queryClient';
import Draggable from 'react-draggable';

// Interfaces for template data
interface Template {
  id: string;
  name: string;
  description: string;
  filename: string;
  path: string;
  lastModified: string;
}

interface TemplateContentResponse {
  success: boolean;
  content: string;
  templateId: string;
}

interface TemplatesResponse {
  templates: Template[];
}

// Define a type for draggable elements
interface DraggableElement {
  id: string;
  type: 'image' | 'text' | 'button' | 'shape';
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  isSelected: boolean;
  style?: {
    backgroundColor?: string;
    color?: string;
    borderRadius?: string;
    borderColor?: string;
    borderWidth?: string;
    padding?: string;
    fontWeight?: string;
    textAlign?: string;
    zIndex?: number;
  };
}

const TemplateManager: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateContent, setTemplateContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [testEmailAddress, setTestEmailAddress] = useState<string>('');
  const [isTestEmailDialogOpen, setIsTestEmailDialogOpen] = useState<boolean>(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState<boolean>(false);
  const [showHtmlEditor, setShowHtmlEditor] = useState<boolean>(false);
  const [isLogoDialogOpen, setIsLogoDialogOpen] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [draggableElements, setDraggableElements] = useState<DraggableElement[]>([]);
  const [isAdvancedEditMode, setIsAdvancedEditMode] = useState<boolean>(false);
  const [newTextContent, setNewTextContent] = useState<string>('');
  const [isTextDialogOpen, setIsTextDialogOpen] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [resizeData, setResizeData] = useState<{
    elementId: string;
    initialSize: { width: number; height: number };
    initialPosition: { x: number; y: number };
    startPoint: { x: number; y: number };
    handle: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  } | null>(null);
  const quillRef = React.useRef<ReactQuill>(null);
  const editorContainerRef = React.useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templatesData, isLoading: isLoadingTemplates, isError: isErrorTemplates, error: templatesError } = 
    useQuery<TemplatesResponse>({
      queryKey: ['/api/templates'],
      refetchOnWindowFocus: false,
    });

  // Fetch template content based on selectedTemplate - fixed to use specific endpoint
  const { data: templateContentData, isLoading: isLoadingContent, isError: isErrorContent, error: contentError } =
    useQuery<TemplateContentResponse>({
      queryKey: [`/api/templates/${selectedTemplate?.replace('.html', '')}`],
      enabled: !!selectedTemplate,
      refetchOnWindowFocus: false
    });
    
  // Update template content when data loads
  useEffect(() => {
    if (templateContentData && templateContentData.success) {
      if (import.meta.env.DEV) { console.log("Template data received:", templateContentData); }
      
      if (templateContentData.content) {
        if (import.meta.env.DEV) { console.log("Template content loaded:", templateContentData.content.substring(0, 50) + "..."); }
        setTemplateContent(templateContentData.content);
      } else {
        console.warn("Template data received but no content field:", templateContentData);
      }
    }
  }, [templateContentData]);
  
  // Set up resize event listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeData) return;
  
      const { elementId, initialSize, initialPosition, startPoint, handle } = resizeData;
      
      // Calculate delta
      const dx = e.clientX - startPoint.x;
      const dy = e.clientY - startPoint.y;
      
      // Calculate new size and position based on which handle is being dragged
      let newWidth = initialSize.width;
      let newHeight = initialSize.height;
      let newX = initialPosition.x;
      let newY = initialPosition.y;
      
      if (handle === 'top-left') {
        newWidth = initialSize.width - dx;
        newHeight = initialSize.height - dy;
        newX = initialPosition.x + dx;
        newY = initialPosition.y + dy;
      } else if (handle === 'top-right') {
        newWidth = initialSize.width + dx;
        newHeight = initialSize.height - dy;
        newY = initialPosition.y + dy;
      } else if (handle === 'bottom-left') {
        newWidth = initialSize.width - dx;
        newHeight = initialSize.height + dy;
        newX = initialPosition.x + dx;
      } else if (handle === 'bottom-right') {
        newWidth = initialSize.width + dx;
        newHeight = initialSize.height + dy;
      }
      
      // Apply minimum size constraints
      newWidth = Math.max(20, newWidth);
      newHeight = Math.max(20, newHeight);
      
      // Update element
      setDraggableElements(
        draggableElements.map(element => 
          element.id === elementId 
            ? { 
                ...element, 
                size: { width: newWidth, height: newHeight },
                position: { x: newX, y: newY }
              } 
            : element
        )
      );
    };
    
    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        setResizeData(null);
      }
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeData, draggableElements]);

  // Mutation to update template content
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: { templateId: string; content: string }) => {
      // Remove .html extension from templateId for API call
      const cleanTemplateId = data.templateId.replace('.html', '');
      return apiRequest(`/api/templates/${cleanTemplateId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: data.content }),
      });
    },
    onSuccess: () => {
      // Invalidate both queries - the list and the specific template content
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      queryClient.invalidateQueries({ queryKey: [`/api/templates/${selectedTemplate?.replace('.html', '')}`] });
      toast({
        title: 'Template updated',
        description: 'The template has been successfully updated.',
        variant: 'default',
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating template',
        description: error.message || 'There was an error updating the template.',
        variant: 'destructive',
      });
    },
  });

  // Mutation to send test email
  const sendTestEmailMutation = useMutation({
    mutationFn: async (data: { templateId: string; email: string }) => {
      // Remove .html extension from templateId for API call
      const cleanTemplateId = data.templateId.replace('.html', '');
      return apiRequest(`/api/templates/${cleanTemplateId}/test`, {
        method: 'POST',
        body: JSON.stringify({ email: data.email }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Test email sent',
        description: `A test email has been sent to ${testEmailAddress}.`,
        variant: 'default',
      });
      setIsTestEmailDialogOpen(false);
      setIsSendingTestEmail(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error sending test email',
        description: error.message || 'There was an error sending the test email.',
        variant: 'destructive',
      });
      setIsSendingTestEmail(false);
    },
  });

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    const currentContent = templateContentData && templateContentData.success && templateContentData.content
      ? templateContentData.content 
      : '';
      
    if (isEditing && templateContent !== currentContent) {
      if (confirm('You have unsaved changes. Are you sure you want to discard them?')) {
        setSelectedTemplate(templateId);
      }
    } else {
      setSelectedTemplate(templateId);
    }
  };

  // Handle save template content
  const handleSaveTemplate = () => {
    if (selectedTemplate) {
      if (import.meta.env.DEV) { console.log(`Saving template: ${selectedTemplate}`); }
      
      // If in advanced edit mode with draggable elements, generate HTML from them
      const contentToSave = isAdvancedEditMode && draggableElements.length > 0
        ? generateHtmlFromDraggableElements()
        : templateContent;
      
      if (import.meta.env.DEV) { console.log(`Content length: ${contentToSave.length} bytes`); }
      if (import.meta.env.DEV) { console.log(`Is advanced mode: ${isAdvancedEditMode}`); }
      if (import.meta.env.DEV) { console.log(`Draggable elements: ${draggableElements.length}`); }
      
      try {
        if (import.meta.env.DEV) { console.log("Sending update request..."); }
        updateTemplateMutation.mutate({
          templateId: selectedTemplate,
          content: contentToSave,
        }, {
          onSuccess: () => {
            if (import.meta.env.DEV) { console.log("Update successful!"); }
          },
          onError: (error: any) => {
            console.error("Update failed:", error);
            console.error("Error details:", error.message);
          }
        });
        
        // If we were in advanced mode, update the template content for consistency
        if (isAdvancedEditMode && draggableElements.length > 0) {
          setTemplateContent(contentToSave);
        }
      } catch (error) {
        console.error("Exception during save:", error);
      }
    } else {
      console.error("No template selected!");
    }
  };

  // Handle preview template
  const handlePreviewTemplate = () => {
    if (selectedTemplate) {
      setPreviewUrl(`/api/templates/${selectedTemplate}/preview`);
      setIsPreviewOpen(true);
    }
  };

  // Handle send test email
  const handleSendTestEmail = () => {
    if (selectedTemplate && testEmailAddress) {
      setIsSendingTestEmail(true);
      sendTestEmailMutation.mutate({
        templateId: selectedTemplate,
        email: testEmailAddress,
      });
    }
  };
  
  // Handle toggle HTML view
  const handleToggleHtmlView = () => {
    setShowHtmlEditor(!showHtmlEditor);
  };
  
  // Handle logo insertion
  const handleInsertLogo = () => {
    setIsLogoDialogOpen(true);
  };
  
  // Handle adding logo to content
  const handleAddLogo = () => {
    if (logoUrl && quillRef.current) {
      const editor = quillRef.current.getEditor();
      const cursorPosition = editor.getSelection()?.index || 0;
      editor.insertEmbed(cursorPosition, 'image', logoUrl);
      setIsLogoDialogOpen(false);
      setLogoUrl('');
    }
  };
  
  // Handle font styling
  const handleFontStyling = () => {
    // This will be expanded later with font selection functionality
    toast({
      title: 'Font options',
      description: 'Font styling options will be available soon.',
      variant: 'default',
    });
  };
  
  // Handle layout changes
  const handleLayoutChange = () => {
    // This will be expanded later with layout template options
    toast({
      title: 'Layout options',
      description: 'Layout template options will be available soon.',
      variant: 'default',
    });
  };
  
  // Toggle advanced edit mode with draggable elements
  const handleToggleAdvancedMode = () => {
    setIsAdvancedEditMode(!isAdvancedEditMode);
    
    // If we're entering advanced mode, parse existing content for draggable elements
    if (!isAdvancedEditMode) {
      // Reset draggable elements
      setDraggableElements([]);
      
      toast({
        title: 'Advanced Edit Mode',
        description: 'You can now freely drag images and text boxes around your template.',
        variant: 'default',
      });
    }
  };
  
  // Add a new image element
  const handleAddDraggableImage = () => {
    if (logoUrl) {
      // First, deselect all existing elements
      const updatedElements = draggableElements.map(el => ({
        ...el,
        isSelected: false
      }));
      
      // Create a new element with the image
      const newElement: DraggableElement = {
        id: `img-${Date.now()}`,
        type: 'image',
        content: logoUrl,
        position: { x: 50, y: 50 }, // Start a bit offset from corner
        size: { width: 200, height: 150 },
        rotation: 0,
        isSelected: true, // Select the new element
        style: {
          zIndex: draggableElements.length + 1,
        }
      };
      
      setDraggableElements([...updatedElements, newElement]);
      setIsLogoDialogOpen(false);
      setLogoUrl('');
    }
  };
  
  // Add a new text box element
  const handleAddTextBox = () => {
    setIsTextDialogOpen(true);
  };
  
  // Create a new text box
  const handleCreateTextBox = () => {
    if (newTextContent) {
      // First, deselect all existing elements
      const updatedElements = draggableElements.map(el => ({
        ...el,
        isSelected: false
      }));
      
      // Create new text box
      const newElement: DraggableElement = {
        id: `text-${Date.now()}`,
        type: 'text',
        content: newTextContent,
        position: { x: 50, y: 50 }, // Start a bit offset from corner
        size: { width: 200, height: 100 },
        rotation: 0,
        isSelected: true, // Select the new element
        style: {
          backgroundColor: 'white',
          borderColor: '#e0e0e0',
          borderWidth: '1px',
          padding: '10px',
          zIndex: draggableElements.length + 1,
        }
      };
      
      setDraggableElements([...updatedElements, newElement]);
      setIsTextDialogOpen(false);
      setNewTextContent('');
    }
  };
  
  // Add a new button element
  const handleAddButton = () => {
    // First, deselect all existing elements
    const updatedElements = draggableElements.map(el => ({
      ...el,
      isSelected: false
    }));
    
    // Create new button
    const newButton: DraggableElement = {
      id: `button-${Date.now()}`,
      type: 'button',
      content: 'Click Me',
      position: { x: 50, y: 50 }, // Start a bit offset from corner
      size: { width: 120, height: 40 },
      rotation: 0,
      isSelected: true, // Select the new element
      style: {
        backgroundColor: '#4a6cf7',
        color: 'white',
        borderRadius: '4px',
        padding: '8px 16px',
        fontWeight: 'bold',
        zIndex: draggableElements.length + 1,
      }
    };
    
    setDraggableElements([...updatedElements, newButton]);
    toast({
      title: 'Button Added',
      description: 'Drag the button to position it in your template.',
      variant: 'default',
    });
  };
  
  // Add a new shape element
  const handleAddShape = (shape: 'square' | 'circle' | 'line') => {
    // First, deselect all existing elements
    const updatedElements = draggableElements.map(el => ({
      ...el,
      isSelected: false
    }));
    
    // Create new shape
    const newShape: DraggableElement = {
      id: `shape-${Date.now()}`,
      type: 'shape',
      content: shape,
      position: { x: 50, y: 50 }, // Start a bit offset from corner
      size: shape === 'line' 
        ? { width: 100, height: 2 } 
        : { width: 100, height: 100 },
      rotation: 0,
      isSelected: true, // Select the new element
      style: {
        backgroundColor: shape === 'line' ? 'transparent' : '#f3f4f6',
        borderColor: '#d1d5db',
        borderWidth: '2px',
        borderRadius: shape === 'circle' ? '50%' : '0',
        zIndex: draggableElements.length + 1,
      },
    };
    
    setDraggableElements([...draggableElements, newShape]);
    toast({
      title: `${shape.charAt(0).toUpperCase() + shape.slice(1)} Added`,
      description: 'Drag the shape to position it in your template.',
      variant: 'default',
    });
  };
  
  // Select an element
  const handleSelectElement = (id: string, e: React.MouseEvent) => {
    // Check if Shift key is pressed for multi-select
    if (e.shiftKey) {
      setDraggableElements(
        draggableElements.map(element => 
          element.id === id 
            ? { ...element, isSelected: !element.isSelected } 
            : element
        )
      );
    } else {
      // Single select - deselect all others
      setDraggableElements(
        draggableElements.map(element => 
          element.id === id 
            ? { ...element, isSelected: true } 
            : { ...element, isSelected: false }
        )
      );
    }
    
    // Prevent propagation to avoid deselection
    e.stopPropagation();
  };
  
  // Deselect all elements when clicking on the canvas
  const handleCanvasClick = () => {
    setDraggableElements(
      draggableElements.map(element => ({ ...element, isSelected: false }))
    );
  };
  
  // Handle element drag start
  const handleDragStart = (id: string) => {
    // If element is not already selected, select it
    const element = draggableElements.find(el => el.id === id);
    if (element && !element.isSelected) {
      setDraggableElements(
        draggableElements.map(el => 
          el.id === id 
            ? { ...el, isSelected: true } 
            : { ...el, isSelected: false }
        )
      );
    }
  };
  
  // Handle element drag stop
  const handleDragStop = (id: string, position: { x: number, y: number }) => {
    setDraggableElements(
      draggableElements.map((element) => 
        element.id === id ? { ...element, position } : element
      )
    );
  };
  
  // Rotate an element
  const handleRotateElement = (id: string, delta: number) => {
    setDraggableElements(
      draggableElements.map(element => 
        element.id === id 
          ? { 
              ...element, 
              rotation: ((element.rotation || 0) + delta) % 360 
            } 
          : element
      )
    );
  };
  
  // Resize an element
  const handleResizeElement = (id: string, newSize: { width: number; height: number }) => {
    setDraggableElements(
      draggableElements.map(element => 
        element.id === id 
          ? { ...element, size: newSize } 
          : element
      )
    );
  };
  
  // Delete a draggable element
  const handleDeleteElement = (id: string) => {
    setDraggableElements(draggableElements.filter(el => el.id !== id));
  };
  
  // Delete all selected elements
  const handleDeleteSelected = () => {
    setDraggableElements(draggableElements.filter(el => !el.isSelected));
  };
  
  // Bring selected element to front
  const handleBringToFront = (id: string) => {
    const targetElement = draggableElements.find(el => el.id === id);
    if (!targetElement) return;
    
    // Find highest zIndex
    const highestZ = draggableElements.reduce((max, el) => {
      const elZ = el.style?.zIndex || 0;
      return elZ > max ? elZ : max;
    }, 0);
    
    // Update zIndex of the target element
    setDraggableElements(
      draggableElements.map(element => 
        element.id === id 
          ? { 
              ...element, 
              style: { 
                ...(element.style || {}), 
                zIndex: highestZ + 1 
              } 
            } 
          : element
      )
    );
  };
  
  // Send selected element to back
  const handleSendToBack = (id: string) => {
    const targetElement = draggableElements.find(el => el.id === id);
    if (!targetElement) return;
    
    // Find lowest zIndex
    const lowestZ = draggableElements.reduce((min, el) => {
      const elZ = el.style?.zIndex || 0;
      return elZ < min ? elZ : min;
    }, 0);
    
    // Update zIndex of the target element
    setDraggableElements(
      draggableElements.map(element => 
        element.id === id 
          ? { 
              ...element, 
              style: { 
                ...(element.style || {}), 
                zIndex: lowestZ - 1 
              } 
            } 
          : element
      )
    );
  };
  
  // Generate HTML from draggable elements when saving
  const generateHtmlFromDraggableElements = () => {
    // This is a more comprehensive implementation with support for rotation and custom styles
    let htmlContent = '<div style="position: relative; width: 100%; min-height: 500px;">';
    
    // Sort elements by z-index for proper layering
    const sortedElements = [...draggableElements].sort((a, b) => 
      (a.style?.zIndex || 0) - (b.style?.zIndex || 0)
    );
    
    sortedElements.forEach(element => {
      // Common positioning styles
      const positionStyle = `position: absolute; left: ${element.position.x}px; top: ${element.position.y}px;`;
      const rotationStyle = element.rotation ? `transform: rotate(${element.rotation}deg);` : '';
      const zIndexStyle = `z-index: ${element.style?.zIndex || 0};`;
      
      if (element.type === 'image') {
        // Image with size, position and rotation
        const imgStyle = `
          ${positionStyle}
          ${rotationStyle}
          ${zIndexStyle}
          width: ${element.size?.width || 'auto'}px;
          height: ${element.size?.height || 'auto'}px;
          max-width: 100%;
          object-fit: contain;
        `;
        htmlContent += `<img src="${element.content}" alt="Image" style="${imgStyle}" />`;
      } else if (element.type === 'text') {
        // Text box with all styles
        const textStyle = `
          ${positionStyle}
          ${rotationStyle}
          ${zIndexStyle}
          width: ${element.size?.width || 200}px;
          min-height: ${element.size?.height || 'auto'}px;
          background-color: ${element.style?.backgroundColor || 'white'};
          color: ${element.style?.color || 'inherit'};
          padding: ${element.style?.padding || '10px'};
          border: ${element.style?.borderWidth || '1px'} solid ${element.style?.borderColor || '#e0e0e0'};
          border-radius: ${element.style?.borderRadius || '4px'};
          text-align: ${element.style?.textAlign || 'left'};
        `;
        htmlContent += `<div style="${textStyle}">${element.content}</div>`;
      } else if (element.type === 'button') {
        // Button with all styles
        const buttonStyle = `
          ${positionStyle}
          ${rotationStyle}
          ${zIndexStyle}
          width: ${element.size?.width || 'auto'}px;
          height: ${element.size?.height || 'auto'}px;
          background-color: ${element.style?.backgroundColor || '#4a6cf7'}; 
          color: ${element.style?.color || 'white'}; 
          border-radius: ${element.style?.borderRadius || '4px'}; 
          padding: ${element.style?.padding || '8px 16px'}; 
          font-weight: ${element.style?.fontWeight || 'bold'};
          text-decoration: none;
          display: inline-block;
          text-align: center;
          line-height: ${element.size?.height ? `${element.size.height - 16}px` : 'normal'};
        `;
           
        htmlContent += `<a href="#" style="${buttonStyle}">${element.content}</a>`;
      } else if (element.type === 'shape') {
        // Shape with all styles
        const shapeStyle = `
          ${positionStyle}
          ${rotationStyle}
          ${zIndexStyle}
          width: ${element.size?.width || 100}px;
          height: ${element.size?.height || 100}px;
          background-color: ${element.style?.backgroundColor || 'transparent'};
          border: ${element.style?.borderWidth || '2px'} solid ${element.style?.borderColor || '#d1d5db'};
          border-radius: ${element.style?.borderRadius || '0'};
        `;
        
        htmlContent += `<div style="${shapeStyle}"></div>`;
      }
    });
    
    htmlContent += '</div>';
    return htmlContent;
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  if (isLoadingTemplates) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Spinner size="lg" />
        <p className="mt-4 text-gray-500">Loading email templates...</p>
      </div>
    );
  }

  if (isErrorTemplates) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-600">Error Loading Templates</h3>
        <p className="mt-2 text-gray-600">
          {templatesError instanceof Error ? templatesError.message : 'Failed to load email templates.'}
        </p>
        <Button 
          className="mt-4" 
          variant="outline" 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/templates'] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  return (
    <>
      <div style={{ 
        display: 'grid',
        gridTemplateColumns: '240px 1fr',
        gap: '1.5rem',
        width: '100%',
        minHeight: '600px',
        maxWidth: '100%',
        overflow: 'hidden'
      }}>
        {/* Template List - Fixed Grid Column */}
        <div style={{ 
          gridColumn: '1',
          overflow: 'hidden'
        }}>
          <div className="bg-gray-50 rounded-md p-3 h-full">
            <h3 className="text-sm font-medium mb-3">Email Templates</h3>
            <div className="space-y-1">
              {templatesData?.templates?.map((template: Template) => (
                <div 
                  key={template.id}
                  className={`p-2 rounded-md cursor-pointer transition-colors ${
                    selectedTemplate === template.id 
                      ? 'bg-purple-100 border-l-4 border-purple-500' 
                      : 'bg-white hover:bg-gray-100 border-l-4 border-transparent'
                  }`}
                  onClick={() => handleSelectTemplate(template.id)}
                >
                  <h4 className="font-medium text-sm">{template.name}</h4>
                  <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Template Editor - Second Grid Column */}
        <div style={{ 
          gridColumn: '2',
          minWidth: 0,
          overflow: 'hidden'
        }}>
          {selectedTemplate ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">
                    {templatesData?.templates?.find((t: Template) => t.id === selectedTemplate)?.name} Template
                  </h3>
                  <p className="text-sm text-gray-500">
                    {templatesData?.templates?.find((t: Template) => t.id === selectedTemplate)?.description}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviewTemplate}
                    disabled={isLoadingContent}
                  >
                    <Eye className="mr-2 h-4 w-4" /> Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsTestEmailDialogOpen(true)}
                    disabled={isLoadingContent}
                  >
                    <Mail className="mr-2 h-4 w-4" /> Test Email
                  </Button>
                </div>
              </div>

              <Separator />

              {isLoadingContent ? (
                <div className="flex flex-col items-center justify-center p-8">
                  <Spinner size="md" />
                  <p className="mt-4 text-gray-500">Loading template content...</p>
                </div>
              ) : isErrorContent ? (
                <div className="p-6 text-center">
                  <AlertTriangle className="mx-auto h-8 w-8 text-red-500 mb-3" />
                  <h3 className="text-base font-semibold text-red-600">Error Loading Template</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {contentError instanceof Error ? contentError.message : 'Failed to load template content.'}
                  </p>
                  <Button 
                    className="mt-4" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/templates', selectedTemplate] })}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" /> Try Again
                  </Button>
                </div>
              ) : (
                <>
                  <div className="bg-gray-50 p-3 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-600">
                        Last Modified: {templatesData?.templates?.find((t: Template) => t.id === selectedTemplate)?.lastModified 
                          ? formatDate(templatesData.templates.find((t: Template) => t.id === selectedTemplate)!.lastModified)
                          : 'N/A'}
                      </span>
                      <div className="flex space-x-2">
                        {isEditing ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (templateContentData && templateContentData.success && templateContentData.content) {
                                  setTemplateContent(templateContentData.content);
                                }
                                setIsEditing(false);
                              }}
                            >
                              <X className="mr-1 h-4 w-4" /> Cancel
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleSaveTemplate}
                              disabled={updateTemplateMutation.isPending}
                            >
                              {updateTemplateMutation.isPending ? (
                                <>
                                  <Spinner size="sm" className="mr-2" /> Saving...
                                </>
                              ) : (
                                <>
                                  <Save className="mr-1 h-4 w-4" /> Save Changes
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditing(true)}
                          >
                            Edit Template
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    {isEditing ? (
                      <div className="editor-container">
                        {/* WYSIWYG Editor */}
                        <div className="editor-toolbar border border-gray-300 rounded-t-md bg-gray-50 p-2 flex gap-2 overflow-x-auto">
                          {!isAdvancedEditMode ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Insert Logo"
                                onClick={handleInsertLogo}
                              >
                                <Image className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Change Layout"
                                onClick={handleLayoutChange}
                              >
                                <Layout className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Edit Font"
                                onClick={handleFontStyling}
                              >
                                <Type className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className={`p-1 h-8 w-8 ${showHtmlEditor ? 'bg-purple-100' : ''}`}
                                title="Show HTML"
                                onClick={handleToggleHtmlView}
                              >
                                <Code className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Add Image"
                                onClick={handleInsertLogo}
                              >
                                <Image className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Add Text Box"
                                onClick={handleAddTextBox}
                              >
                                <TextIcon className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 h-8 w-8" 
                                title="Add Button"
                                onClick={handleAddButton}
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                              
                              <Separator orientation="vertical" className="h-6 mx-1" />
                              
                              <div className="flex items-center">
                                <span className="text-xs text-gray-500 mr-1">Shapes:</span>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="p-1 h-8 w-8" 
                                  title="Add Square"
                                  onClick={() => handleAddShape('square')}
                                >
                                  <div className="h-4 w-4 border border-gray-500" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="p-1 h-8 w-8" 
                                  title="Add Circle"
                                  onClick={() => handleAddShape('circle')}
                                >
                                  <div className="h-4 w-4 border border-gray-500 rounded-full" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="p-1 h-8 w-8" 
                                  title="Add Line"
                                  onClick={() => handleAddShape('line')}
                                >
                                  <div className="h-0.5 w-4 bg-gray-500" />
                                </Button>
                              </div>
                            </>
                          )}
                          
                          <Separator orientation="vertical" className="h-6 mx-1" />
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className={`p-1 flex items-center ${isAdvancedEditMode ? 'bg-purple-100' : ''}`}
                            title={isAdvancedEditMode ? "Switch to Normal Editor" : "Switch to Advanced Editor"}
                            onClick={handleToggleAdvancedMode}
                          >
                            <MoveIcon className="h-4 w-4 mr-1" />
                            {isAdvancedEditMode ? "Draggable Mode" : "Advanced Mode"}
                          </Button>
                        </div>
                        
                        {isAdvancedEditMode ? (
                          /* Draggable Editor Area */
                          <div
                            ref={editorContainerRef}
                            className="w-full h-[450px] border border-gray-300 rounded-b-md bg-white p-4 overflow-auto relative"
                            style={{ minHeight: '450px' }}
                            onClick={handleCanvasClick}
                          >
                            {/* Draggable elements */}
                            {draggableElements.map((element) => (
                              <Draggable
                                key={element.id}
                                defaultPosition={element.position}
                                position={element.position}
                                onStart={() => handleDragStart(element.id)}
                                onStop={(e, data) => handleDragStop(element.id, { x: data.x, y: data.y })}
                                bounds="parent"
                                scale={1}
                              >
                                <div 
                                  className={`excalidraw-element ${element.isSelected ? 'selected' : ''}`}
                                  onClick={(e) => handleSelectElement(element.id, e)}
                                  style={{ 
                                    position: 'absolute',
                                    transform: `rotate(${element.rotation || 0}deg)`,
                                    zIndex: element.style?.zIndex || 0,
                                  }}
                                >
                                  {/* Element content based on type */}
                                  {element.type === 'image' ? (
                                    <div className="element-content">
                                      <img 
                                        src={element.content} 
                                        alt="Draggable image" 
                                        style={{
                                          width: element.size?.width || 'auto',
                                          height: element.size?.height || 'auto',
                                          maxWidth: '300px',
                                        }}
                                        className="excalidraw-image"
                                      />
                                    </div>
                                  ) : element.type === 'text' ? (
                                    <div 
                                      className="element-content excalidraw-text"
                                      style={{
                                        width: element.size?.width || 200,
                                        minHeight: element.size?.height || 'auto',
                                        backgroundColor: element.style?.backgroundColor || 'white',
                                        padding: element.style?.padding || '10px',
                                        border: `${element.style?.borderWidth || '1px'} solid ${element.style?.borderColor || '#e0e0e0'}`,
                                        borderRadius: element.style?.borderRadius || '4px',
                                      }}
                                    >
                                      {element.content}
                                    </div>
                                  ) : element.type === 'button' ? (
                                    <button 
                                      className="element-content excalidraw-button"
                                      style={{
                                        width: element.size?.width || 'auto',
                                        height: element.size?.height || 'auto',
                                        backgroundColor: element.style?.backgroundColor || '#4a6cf7',
                                        color: element.style?.color || 'white',
                                        borderRadius: element.style?.borderRadius || '4px',
                                        padding: element.style?.padding || '8px 16px',
                                        fontWeight: element.style?.fontWeight || 'bold',
                                      }}
                                    >
                                      {element.content}
                                    </button>
                                  ) : element.type === 'shape' ? (
                                    <div 
                                      className="element-content excalidraw-shape"
                                      style={{
                                        width: element.size?.width || 100,
                                        height: element.size?.height || 100,
                                        backgroundColor: element.style?.backgroundColor || 'transparent',
                                        border: `${element.style?.borderWidth || '2px'} solid ${element.style?.borderColor || '#d1d5db'}`,
                                        borderRadius: element.style?.borderRadius || '0',
                                      }}
                                    />
                                  ) : null}
                                  
                                  {/* Controls that appear when element is selected */}
                                  {element.isSelected && (
                                    <div className="element-controls">
                                      {/* Resize handles */}
                                      <div className="resize-handle top-left" 
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          const elementData = draggableElements.find(el => el.id === element.id);
                                          if (elementData) {
                                            setIsResizing(true);
                                            setResizeData({
                                              elementId: element.id,
                                              initialSize: { ...elementData.size },
                                              initialPosition: { ...elementData.position },
                                              startPoint: { x: e.clientX, y: e.clientY },
                                              handle: 'top-left'
                                            });
                                          }
                                        }} 
                                      />
                                      <div className="resize-handle top-right" 
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          const elementData = draggableElements.find(el => el.id === element.id);
                                          if (elementData) {
                                            setIsResizing(true);
                                            setResizeData({
                                              elementId: element.id,
                                              initialSize: { ...elementData.size },
                                              initialPosition: { ...elementData.position },
                                              startPoint: { x: e.clientX, y: e.clientY },
                                              handle: 'top-right'
                                            });
                                          }
                                        }} 
                                      />
                                      <div className="resize-handle bottom-left" 
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          const elementData = draggableElements.find(el => el.id === element.id);
                                          if (elementData) {
                                            setIsResizing(true);
                                            setResizeData({
                                              elementId: element.id,
                                              initialSize: { ...elementData.size },
                                              initialPosition: { ...elementData.position },
                                              startPoint: { x: e.clientX, y: e.clientY },
                                              handle: 'bottom-left'
                                            });
                                          }
                                        }} 
                                      />
                                      <div className="resize-handle bottom-right" 
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          const elementData = draggableElements.find(el => el.id === element.id);
                                          if (elementData) {
                                            setIsResizing(true);
                                            setResizeData({
                                              elementId: element.id,
                                              initialSize: { ...elementData.size },
                                              initialPosition: { ...elementData.position },
                                              startPoint: { x: e.clientX, y: e.clientY },
                                              handle: 'bottom-right'
                                            });
                                          }
                                        }} 
                                      />
                                      
                                      {/* Rotation handle */}
                                      <div 
                                        className="rotation-handle"
                                        onMouseDown={(e) => {
                                          e.stopPropagation();
                                          
                                          // Get element center
                                          const elementData = draggableElements.find(el => el.id === element.id);
                                          if (!elementData) return;
                                          
                                          const elementRect = e.currentTarget.parentElement?.parentElement?.getBoundingClientRect();
                                          if (!elementRect) return;
                                          
                                          const centerX = elementRect.left + elementRect.width / 2;
                                          const centerY = elementRect.top + elementRect.height / 2;
                                          
                                          // Calculate initial angle
                                          const initialAngle = Math.atan2(
                                            e.clientY - centerY,
                                            e.clientX - centerX
                                          ) * (180 / Math.PI);
                                          
                                          // Set up mouse move handler for rotation
                                          const handleRotateMove = (moveEvent: MouseEvent) => {
                                            const currentAngle = Math.atan2(
                                              moveEvent.clientY - centerY,
                                              moveEvent.clientX - centerX
                                            ) * (180 / Math.PI);
                                            
                                            // Calculate rotation delta
                                            let delta = currentAngle - initialAngle;
                                            
                                            // Apply rotation
                                            handleRotateElement(element.id, delta);
                                          };
                                          
                                          const handleRotateUp = () => {
                                            document.removeEventListener('mousemove', handleRotateMove);
                                            document.removeEventListener('mouseup', handleRotateUp);
                                          };
                                          
                                          document.addEventListener('mousemove', handleRotateMove);
                                          document.addEventListener('mouseup', handleRotateUp);
                                        }}
                                      >
                                        <RotateCw className="h-3 w-3" />
                                      </div>
                                      
                                      {/* Delete button */}
                                      <button
                                        className="delete-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteElement(element.id);
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                      
                                      {/* Controls toolbar */}
                                      <div className="element-toolbar">
                                        <button
                                          className="toolbar-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRotateElement(element.id, -15);
                                          }}
                                          title="Rotate Left"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </button>
                                        <button
                                          className="toolbar-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRotateElement(element.id, 15);
                                          }}
                                          title="Rotate Right"
                                        >
                                          <RotateCw className="h-3 w-3" />
                                        </button>
                                        <button
                                          className="toolbar-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleBringToFront(element.id);
                                          }}
                                          title="Bring to Front"
                                        >
                                          <MoveUp className="h-3 w-3" />
                                        </button>
                                        <button
                                          className="toolbar-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSendToBack(element.id);
                                          }}
                                          title="Send to Back"
                                        >
                                          <MoveDown className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </Draggable>
                            ))}
                            {/* Empty state */}
                            {draggableElements.length === 0 && (
                              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <MoveIcon className="h-12 w-12 mb-4" />
                                <p className="text-center">
                                  Use the toolbar above to add images or text boxes, then drag them to position.
                                </p>
                              </div>
                            )}
                          </div>
                        ) : showHtmlEditor ? (
                          <textarea
                            className="w-full h-[450px] p-4 border border-gray-300 rounded-b-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={templateContent}
                            onChange={(e) => setTemplateContent(e.target.value)}
                            spellCheck="false"
                          />
                        ) : (
                          <ReactQuill 
                            ref={quillRef}
                            theme="snow"
                            value={templateContent}
                            onChange={setTemplateContent}
                            className="h-[450px] rounded-b-md"
                            modules={{
                              toolbar: [
                                [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                                ['bold', 'italic', 'underline', 'strike'],
                                [{ 'color': [] }, { 'background': [] }],
                                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                                [{ 'align': [] }],
                                ['link', 'image'],
                                ['clean']
                              ]
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="preview-container border border-gray-300 rounded-md bg-white h-[500px] overflow-hidden">
                        <div className="h-full overflow-auto">
                          <div
                            className="p-4 max-w-full"
                            style={{ 
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word',
                              maxWidth: '100%'
                            }}
                            dangerouslySetInnerHTML={{ __html: templateContent }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[400px] border-2 border-dashed border-gray-200 rounded-md p-8 text-center">
              <Mail className="h-16 w-16 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-600">No Template Selected</h3>
              <p className="mt-2 text-gray-500 max-w-md">
                Select an email template from the list on the left to view and edit its content.
              </p>
            </div>
          )}
      </div>
    </div>

    <AlertDialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Template Preview</AlertDialogTitle>
            <AlertDialogDescription>
              This is how the email will appear when sent to recipients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {previewUrl && (
            <div className="border rounded-md h-[600px] overflow-auto">
              <iframe 
                src={previewUrl} 
                className="w-full h-full" 
                title="Template Preview"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Email Dialog */}
      <AlertDialog open={isTestEmailDialogOpen} onOpenChange={setIsTestEmailDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Test Email</AlertDialogTitle>
            <AlertDialogDescription>
              Enter an email address to receive a test email using this template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="test-email">Email Address</Label>
            <Input
              id="test-email"
              type="email"
              placeholder="Enter email address"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSendTestEmail();
              }}
              disabled={!testEmailAddress || isSendingTestEmail}
            >
              {isSendingTestEmail ? (
                <>
                  <Spinner size="sm" className="mr-2" /> Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" /> Send Test Email
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logo Insertion Dialog */}
      <AlertDialog open={isLogoDialogOpen} onOpenChange={setIsLogoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Insert Logo</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the URL of the logo you want to insert into the template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              type="text"
              placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="mt-2"
            />
            {logoUrl && (
              <div className="mt-4 border p-4 rounded-md">
                <p className="text-sm text-gray-500 mb-2">Preview:</p>
                <div className="flex justify-center">
                  <img 
                    src={logoUrl} 
                    alt="Logo Preview" 
                    className="max-h-24 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 viewBox%3D%220 0 24 24%22 fill%3D%22none%22 stroke%3D%22%23d1d5db%22 stroke-width%3D%222%22 stroke-linecap%3D%22round%22 stroke-linejoin%3D%22round%22%3E%3Crect x%3D%223%22 y%3D%223%22 width%3D%2218%22 height%3D%2218%22 rx%3D%222%22 ry%3D%222%22%2F%3E%3Ccircle cx%3D%228.5%22 cy%3D%228.5%22 r%3D%221.5%22%2F%3E%3Cpolyline points%3D%2221 15 16 10 5 21%22%2F%3E%3C%2Fsvg%3E';
                      toast({
                        title: 'Image error',
                        description: 'Unable to load the image from the provided URL.',
                        variant: 'destructive',
                      });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                isAdvancedEditMode ? handleAddDraggableImage() : handleAddLogo();
              }}
              disabled={!logoUrl}
            >
              {isAdvancedEditMode ? "Add Draggable Image" : "Insert Logo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Text Box Dialog */}
      <AlertDialog open={isTextDialogOpen} onOpenChange={setIsTextDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add Text Box</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the text you want to add as a draggable text box.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="text-content">Text Content</Label>
            <textarea
              id="text-content"
              placeholder="Enter text here..."
              value={newTextContent}
              onChange={(e) => setNewTextContent(e.target.value)}
              className="w-full h-32 p-2 mt-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCreateTextBox();
              }}
              disabled={!newTextContent}
            >
              Add Text Box
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TemplateManager;