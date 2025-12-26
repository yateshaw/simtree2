import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Shield } from "lucide-react";
import { useLocation } from "wouter";

export default function Legal() {
  const [location, setLocation] = useLocation();
  
  // Extract return URL from query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const returnUrl = urlParams.get('return') || '/dashboard';
  const backButtonText = returnUrl === '/complete-profile' ? 'Back to Profile' : 'Back to Dashboard';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => setLocation(returnUrl)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backButtonText}
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Legal Information</h1>
          <p className="text-gray-600">Terms & Conditions and Privacy Policy</p>
        </div>

        {/* Terms and Conditions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Terms & Conditions
            </CardTitle>
            <p className="text-sm text-gray-600">Effective Date: 6/9/2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p className="mb-4">
              Welcome to <strong>SIMTREE - Global eSIM Solutions for Business</strong>. By accessing or using our website, services, or products, you agree to be bound by the following Terms & Conditions. If you do not agree to these terms, please do not use our services.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">1. Use of the Website</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>SIMTREE - Global eSIM Solutions for Business provides eSIM solutions for businesses and individuals.</li>
              <li>You agree to use our services only for lawful purposes.</li>
              <li>You are responsible for maintaining the confidentiality of your account information.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">2. Eligibility</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years old to use our services.</li>
              <li>By using SIMTREE - Global eSIM Solutions for Business, you represent and warrant that you meet all eligibility requirements.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">3. Payments and Refunds</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>All payments for services are processed securely. Pricing details are available on the panel.</li>
              <li>Refunds are available only for unused plans. Once a plan starts being consumed, it will not be eligible for a refund.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">4. Intellectual Property</h3>
            <p>All content on SIMTREE - Global eSIM Solutions for Business, including logos, text, graphics, and software, is the property of Simtree FZC and is protected by intellectual property laws.</p>

            <h3 className="text-lg font-semibold mt-6 mb-3">5. Service Availability</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>We strive to maintain uptime but do not guarantee uninterrupted access.</li>
              <li>Simtree reserves the right to modify or discontinue services at any time.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">6. Limitation of Liability</h3>
            <p>Simtree is not liable for any indirect, incidental, or consequential damages arising from the use of our services.</p>

            <h3 className="text-lg font-semibold mt-6 mb-3">7. Governing Law</h3>
            <p>These Terms shall be governed by the laws of the United Arab Emirates.</p>
          </CardContent>
        </Card>

        {/* Privacy Policy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy Policy
            </CardTitle>
            <p className="text-sm text-gray-600">Effective Date: 6/9/2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <p className="mb-4">
              Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your information.
            </p>

            <h3 className="text-lg font-semibold mt-6 mb-3">1. Information We Collect</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Personal Information:</strong> Name, email address, phone number, company information, billing information.</li>
              <li><strong>Usage Data:</strong> IP address, browser type, usage patterns.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">2. How We Use Your Information</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and maintain our services.</li>
              <li>To process transactions.</li>
              <li>To improve user experience.</li>
              <li>To provide you with compliant invoices.</li>
              <li>To communicate with you regarding updates or promotions.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">3. Sharing Your Information</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>We do not sell your data.</li>
              <li>We may share information with trusted third parties who assist in operating our website and conducting our business, as long as they agree to keep this information confidential.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">4. Data Security</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>We use industry-standard security measures to protect your data.</li>
              <li>However, no method of transmission over the internet is 100% secure.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">5. Your Rights</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>You may request to view, update, or delete your personal data.</li>
              <li>Contact us at hello@simtree.co for requests.</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6 mb-3">6. Cookies</h3>
            <p>We use cookies to enhance your experience. You can disable cookies in your browser settings.</p>

            <h3 className="text-lg font-semibold mt-6 mb-3">7. Changes to This Policy</h3>
            <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date.</p>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">Contact Us</h4>
              <p className="text-blue-800">
                For questions or concerns regarding these terms or our privacy practices, please contact us at <strong>hello@simtree.co</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}