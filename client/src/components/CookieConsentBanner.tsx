import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Cookie, Shield, BarChart3, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CookiePreferences {
  essential: boolean;
  analytics: boolean;
  marketing: boolean;
}

const COOKIE_CONSENT_KEY = 'simtree_cookie_consent';
const COOKIE_PREFERENCES_KEY = 'simtree_cookie_preferences';

export default function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true, // Always required
    analytics: false,
    marketing: false
  });

  useEffect(() => {
    // Check if user has already given consent
    const hasConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!hasConsent) {
      setIsVisible(true);
    }

    // Load existing preferences
    const savedPreferences = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
    }
  }, []);

  const handleAcceptAll = () => {
    const allAccepted = {
      essential: true,
      analytics: true,
      marketing: true
    };
    
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(allAccepted));
    setIsVisible(false);
    
    // Initialize analytics/marketing cookies here if needed
    initializeCookies(allAccepted);
  };

  const handleAcceptSelected = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(preferences));
    setIsVisible(false);
    setShowPreferences(false);
    
    // Initialize only selected cookies
    initializeCookies(preferences);
  };

  const handleRejectAll = () => {
    const essentialOnly = {
      essential: true,
      analytics: false,
      marketing: false
    };
    
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(essentialOnly));
    setIsVisible(false);
    
    // Initialize only essential cookies
    initializeCookies(essentialOnly);
  };

  const initializeCookies = (prefs: CookiePreferences) => {
    // Here you would initialize your tracking scripts based on preferences
    if (prefs.analytics) {
      // Initialize analytics (Google Analytics, etc.)
      console.log('Analytics cookies enabled');
    }
    if (prefs.marketing) {
      // Initialize marketing cookies
      console.log('Marketing cookies enabled');
    }
  };

  const updatePreference = (key: keyof CookiePreferences, value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-sm border-t shadow-lg">
      <Card className="max-w-6xl mx-auto">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Cookie className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2">Cookie Preferences</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
                We use cookies to enhance your experience on our B2B eSIM management platform. 
                Essential cookies are required for core functionality, while optional cookies help us 
                improve our services and provide better analytics.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleAcceptAll} className="bg-primary hover:bg-primary/90">
                  Accept All
                </Button>
                
                <Button onClick={handleRejectAll} variant="outline">
                  Essential Only
                </Button>
                
                <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      Customize
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Cookie Preferences</DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                            <div>
                              <Label className="text-base font-medium">Essential Cookies</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                Required for authentication, security, and basic platform functionality.
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={preferences.essential}
                            disabled={true}
                            aria-label="Essential cookies (required)"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            <BarChart3 className="h-5 w-5 text-blue-600 mt-0.5" />
                            <div>
                              <Label className="text-base font-medium">Analytics Cookies</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                Help us understand platform usage and improve user experience.
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={preferences.analytics}
                            onCheckedChange={(checked) => updatePreference('analytics', checked)}
                            aria-label="Analytics cookies"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-start gap-3">
                            <Target className="h-5 w-5 text-purple-600 mt-0.5" />
                            <div>
                              <Label className="text-base font-medium">Marketing Cookies</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                Used for targeted communications and service improvements.
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={preferences.marketing}
                            onCheckedChange={(checked) => updatePreference('marketing', checked)}
                            aria-label="Marketing cookies"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowPreferences(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleAcceptSelected}>
                          Save Preferences
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}