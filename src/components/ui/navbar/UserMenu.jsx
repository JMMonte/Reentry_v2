import React from 'react';
import { Button } from '../button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';
import PropTypes from 'prop-types';

function UserMenu({ user, handleLogin, handleLogout, stringToColor }) {
    if (user) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-3 py-1 shadow-sm" style={{ borderRadius: 8, minHeight: 36, border: 'none', cursor: 'pointer' }}>
                        <span className="text-sm font-medium" style={{ marginRight: 10 }}>
                            {user.user_metadata?.name || user.email}
                        </span>
                        <span
                            className="inline-block"
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: stringToColor(user.user_metadata?.name || user.email || ''),
                                display: 'inline-block',
                                marginLeft: 0,
                            }}
                        />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                        {user.email || user.user_metadata?.name || 'User'}
                    </div>
                    <DropdownMenuItem onClick={handleLogout}>
                        Logout
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }
    // Not logged in
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleLogin}
                    >
                        {/* User icon from lucide-react */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-white">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                        </svg>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    Sign In / Sign Up
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

UserMenu.propTypes = {
    user: PropTypes.object,
    handleLogin: PropTypes.func.isRequired,
    handleLogout: PropTypes.func.isRequired,
    stringToColor: PropTypes.func.isRequired,
};

export default UserMenu; 