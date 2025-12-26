import { Button } from "./button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, CircleDollarSign } from "lucide-react";
import { Link } from "react-router-dom";

export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="bg-background border-b sticky top-0 z-50">
      <div className="container flex h-16 items-center justify-between py-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <CircleDollarSign className="h-6 w-6" />
            eSIM Manager
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span className="font-medium">{user.username || "User"}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}