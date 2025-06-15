import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '@/supabaseClient';
import { DraggableModal } from '../modal/DraggableModal';
import { Input } from '../input';
import { Button } from '../button';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

export function ResetPasswordModal({ isOpen, onClose, showToast }) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [canClose, setCanClose] = useState(false);

    const handleReset = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            showToast('Passwords do not match.');
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) {
            await supabase.auth.signOut(); // Clear session after password reset
        }
        setLoading(false);
        if (error) {
            showToast(error.message || 'Failed to reset password.');
        } else {
            showToast('Password updated! Please log in with your new password.');
            setCanClose(true);
            onClose();
        }
    };

    // Prevent closing by escape or outside click unless canClose is true
    // DraggableModal does not have built-in props for this, so we do not pass onClose until canClose is true
    return (
        <DraggableModal
            title="Set New Password"
            isOpen={isOpen}
            onClose={canClose ? onClose : undefined}
            defaultWidth={340}
            defaultHeight={320}
            minWidth={250}
            minHeight={200}
            defaultPosition={{ x: window.innerWidth / 2 - 170, y: window.innerHeight * 0.2 }}
            hideClose={!canClose}
        >
            <form onSubmit={handleReset} className="flex flex-col gap-3 px-4 py-4">
                <label htmlFor="new-password" className="font-medium text-sm">New Password</label>
                <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Enter new password"
                    className="w-full text-sm"
                />
                <PasswordStrengthMeter password={password} />
                <label htmlFor="confirm-password" className="font-medium text-sm">Confirm Password</label>
                <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    className="w-full text-sm"
                />
                <Button type="submit" variant="default" size="sm" disabled={loading} className="rounded-md mt-2 w-full text-sm">
                    {loading ? 'Updating...' : 'Set Password'}
                </Button>
            </form>
        </DraggableModal>
    );
}

ResetPasswordModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    showToast: PropTypes.func.isRequired
}; 