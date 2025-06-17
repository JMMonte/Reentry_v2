import React, { useMemo, useCallback } from 'react';
import { Button } from '../button';
import { User, LogOut, LogIn } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';
import PropTypes from 'prop-types';

// OPTIMIZED PATTERN: Memoized UserMenu component
const UserMenu = React.memo(function UserMenu({ user, handleLogin, handleLogout }) {
    // Memoized menu items based on authentication state
    const menuItems = useMemo(() => {
        if (user) {
            return [
                {
                    key: 'profile',
                    icon: User,
                    label: user.email || 'Profile',
                    disabled: true,
                    className: 'text-xs opacity-60'
                },
                {
                    key: 'logout',
                    icon: LogOut,
                    label: 'Sign Out',
                    onClick: handleLogout,
                    className: 'text-red-600 hover:text-red-700'
                }
            ];
        } else {
            return [
                {
                    key: 'login',
                    icon: LogIn,
                    label: 'Sign In',
                    onClick: handleLogin,
                    className: 'text-blue-600 hover:text-blue-700'
                }
            ];
        }
    }, [user, handleLogin, handleLogout]);

    // Memoized menu item renderer
    const renderMenuItem = useCallback((item) => {
        const IconComponent = item.icon;
        return (
            <DropdownMenuItem
                key={item.key}
                onClick={item.onClick}
                disabled={item.disabled}
                className={item.className}
            >
                <IconComponent className="mr-2 h-4 w-4" />
                {item.label}
            </DropdownMenuItem>
        );
    }, []);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <User className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {menuItems.map(renderMenuItem)}
            </DropdownMenuContent>
        </DropdownMenu>
    );
});

UserMenu.propTypes = {
    user: PropTypes.object,
    handleLogin: PropTypes.func.isRequired,
    handleLogout: PropTypes.func.isRequired
};

export default UserMenu; 