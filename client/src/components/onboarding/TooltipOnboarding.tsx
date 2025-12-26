import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, CheckCircle2, Users, Wallet, Globe, Activity, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TooltipStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  icon: React.ReactNode;
  actionRequired?: boolean;
}

const onboardingSteps: TooltipStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Your Dashboard!',
    description: 'Let\'s take a quick tour to help you get started with the essential features.',
    targetSelector: '[data-testid="dashboard-header"]',
    placement: 'bottom',
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
  {
    id: 'add-employee',
    title: 'Add Your First Employee',
    description: 'Start by adding an employee who will receive eSIM plans. Click this button to add your first team member.',
    targetSelector: '[data-testid="button-add-employee"]',
    placement: 'bottom',
    icon: <Users className="h-5 w-5" />,
    actionRequired: true,
  },
  {
    id: 'wallet-section',
    title: 'Manage Your Wallet',
    description: 'Your current balance is shown here. Click this button to open your wallet where you can add credits to purchase eSIM plans.',
    targetSelector: '[data-testid="balance-button"]',
    placement: 'bottom',
    icon: <Wallet className="h-5 w-5" />,
    actionRequired: true,
  },
  {
    id: 'monthly-spending',
    title: 'Track Monthly Spending',
    description: 'Monitor your monthly eSIM spending. This shows your total costs for the current billing period, helping you stay on budget.',
    targetSelector: '[data-testid="monthly-spending-card"]',
    placement: 'top',
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    id: 'esim-status',
    title: 'eSIM Status Overview',
    description: 'Monitor your eSIM status at a glance. See how many eSIMs are active (ready to use) and waiting for activation.',
    targetSelector: '[data-testid="esim-status-card"]',
    placement: 'bottom',
    icon: <Activity className="h-5 w-5" />,
  },
  {
    id: 'employees-count',
    title: 'Employee Overview',
    description: 'Track your team status. See how many employees have active plans, inactive plans, and your total team count. When you add employees, you\'ll see "Add Plan" buttons to assign connectivity.',
    targetSelector: '[data-testid="employees-count-card"]',
    placement: 'bottom',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    id: 'assign-plans',
    title: 'Assign eSIM Plans',
    description: 'Once you have employees and balance, you can assign eSIM plans to your team members from the Employees tab. Look for the "Add Plan" button next to each employee to assign them connectivity.',
    targetSelector: '[data-testid="employees-tab"]',
    placement: 'bottom',
    icon: <Users className="h-5 w-5" />,
  },
  {
    id: 'bulk-assignment',
    title: 'Bulk Plan Assignment',
    description: 'Need to assign the same plan to multiple employees? Use this tab to select multiple team members and assign plans in bulk. Perfect for when your team needs the same connectivity package.',
    targetSelector: '[data-testid="bulk-assignment-tab"]',
    placement: 'bottom',
    icon: <Globe className="h-5 w-5" />,
  },
  {
    id: 'usage-monitor',
    title: 'Usage Monitor',
    description: 'Track data usage and monitor how much data your employees are consuming on their eSIM plans. You\'ll see real-time usage statistics and alerts when plans are running low.',
    targetSelector: '[data-testid="usage-monitor-tab"]',
    placement: 'bottom',
    icon: <TrendingUp className="h-5 w-5" />,
  },
];

interface TooltipOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function TooltipOnboarding({ onComplete, onSkip }: TooltipOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [showTooltip, setShowTooltip] = useState(false);

  const currentStepData = onboardingSteps[currentStep];

  // Calculate tooltip position based on target element
  const calculateTooltipPosition = () => {
    const targetElement = document.querySelector(currentStepData.targetSelector);
    if (!targetElement) {
      if (import.meta.env.DEV) {
        console.warn(`Target element not found: ${currentStepData.targetSelector}`);
      }
      // Skip to next step if element is not found
      setTimeout(() => {
        if (currentStep < onboardingSteps.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          handleComplete();
        }
      }, 100);
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const tooltipOffset = 20;
    let top = 0;
    let left = 0;

    switch (currentStepData.placement) {
      case 'bottom':
        top = rect.bottom + tooltipOffset;
        left = rect.left + (rect.width / 2);
        break;
      case 'top':
        top = rect.top - tooltipOffset;
        left = rect.left + (rect.width / 2);
        break;
      case 'right':
        top = rect.top + (rect.height / 2);
        left = rect.right + tooltipOffset;
        break;
      case 'left':
        top = rect.top + (rect.height / 2);
        left = rect.left - tooltipOffset;
        break;
    }

    setTooltipPosition({ top, left });
    setShowTooltip(true);

    // Highlight the target element
    targetElement.classList.add('onboarding-highlight');
  };

  // Remove highlighting from all elements
  const removeHighlighting = () => {
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
      el.classList.remove('onboarding-highlight');
    });
  };

  // Update position when step changes
  useEffect(() => {
    if (currentStepData) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        calculateTooltipPosition();
      }, 100);
    }

    return () => {
      removeHighlighting();
    };
  }, [currentStep, currentStepData]);

  // Handle window resize and scroll
  useEffect(() => {
    const handleResizeOrScroll = () => {
      if (showTooltip) {
        calculateTooltipPosition();
      }
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true); // Use capture phase to catch all scroll events
    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [showTooltip, currentStepData]);

  const handleNext = () => {
    removeHighlighting();
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    removeHighlighting();
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    removeHighlighting();
    setShowTooltip(false);
    onComplete();
  };

  const handleSkip = () => {
    removeHighlighting();
    setShowTooltip(false);
    onSkip();
  };

  if (!showTooltip || !currentStepData) {
    return null;
  }

  return (
    <>
      {/* Overlay to darken background */}
      <div className="fixed inset-0 bg-black/30 z-40" />
      
      {/* Tooltip */}
      <div
        className="fixed z-50 transition-all duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform: 'translate(-50%, 0)',
        }}
      >
        <Card className="w-80 shadow-lg border-2 border-primary/20">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                  {currentStepData.icon}
                </div>
                <Badge variant="secondary" className="text-xs">
                  Step {currentStep + 1} of {onboardingSteps.length}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="p-1 h-auto"
                data-testid="button-skip-tooltip-tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">{currentStepData.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {currentStepData.description}
              </p>
              
              {currentStepData.actionRequired && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-blue-800 text-xs font-medium">
                    💡 Try clicking the highlighted element to continue!
                  </p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep === 0}
                className="flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Previous
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  data-testid="button-skip-tour"
                >
                  Skip Tour
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="flex items-center gap-1"
                  data-testid="button-next-step"
                >
                  {currentStep === onboardingSteps.length - 1 ? 'Complete' : 'Next'}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Arrow pointing to target */}
        <div
          className={`absolute w-3 h-3 bg-white border transform rotate-45 ${
            currentStepData.placement === 'bottom' ? '-top-1.5 border-t-0 border-l-0' :
            currentStepData.placement === 'top' ? '-bottom-1.5 border-b-0 border-r-0' :
            currentStepData.placement === 'right' ? '-left-1.5 border-l-0 border-b-0' :
            '-right-1.5 border-r-0 border-t-0'
          }`}
          style={{
            left: currentStepData.placement === 'left' || currentStepData.placement === 'right' ? 
              (currentStepData.placement === 'left' ? 'auto' : '100%') : '50%',
            top: currentStepData.placement === 'top' || currentStepData.placement === 'bottom' ? 
              (currentStepData.placement === 'top' ? 'auto' : '100%') : '50%',
            transform: currentStepData.placement === 'left' || currentStepData.placement === 'right' ? 
              'translateY(-50%) rotate(45deg)' : 'translateX(-50%) rotate(45deg)',
          }}
        />
      </div>

      {/* CSS for highlighting */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .onboarding-highlight {
            position: relative !important;
            z-index: 41 !important;
            border: 2px solid #3b82f6 !important;
            border-radius: 8px !important;
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3) !important;
            animation: onboarding-pulse 2s infinite !important;
          }

          @keyframes onboarding-pulse {
            0%, 100% {
              box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
            }
            50% {
              box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.2);
            }
          }
        `
      }} />
    </>
  );
}