import React, { useState, useContext } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';
import { Tabs, TabsList, TabsTrigger } from '../tabs';
import { Input } from '../input';
import { supabase } from '../../../supabaseClient';
import { ToastContext } from '../../Layout';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

export function AuthModal({ isOpen, onClose, mode: externalMode, setMode: externalSetMode, onSignupSuccess }) {
    const [internalMode, setInternalMode] = useState('signin'); // 'signin' or 'signup'
    const mode = externalMode !== undefined ? externalMode : internalMode;
    const setMode = externalSetMode !== undefined ? externalSetMode : setInternalMode;
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [forgotMode, setForgotMode] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const { showToast } = useContext(ToastContext);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        if (mode === 'signup') {
            if (password !== confirmPassword) {
                showToast('Passwords do not match.');
                setLoading(false);
                return;
            }
            try {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { name } }
                });
                if (error) {
                    showToast(error.message || 'Signup failed.');
                } else {
                    if (onSignupSuccess) onSignupSuccess('Signup successful! Check your email to confirm.');
                    showToast('Signup successful! Check your email to confirm.');
                    onClose();
                }
            } catch {
                showToast('Signup error.');
            }
            setLoading(false);
        } else {
            // Sign in
            try {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) {
                    showToast('Invalid email or password.');
                } else {
                    showToast('Login successful!');
                    onClose();
                }
            } catch {
                showToast('Login error.');
            }
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail);
            if (error) {
                showToast(error.message || 'Failed to send reset email.');
            } else {
                showToast('Password reset email sent! Check your inbox.');
                setForgotMode(false);
                setResetEmail('');
            }
        } catch {
            showToast('Failed to send reset email.');
        }
        setLoading(false);
    };

    return (
        <DraggableModal
            title={forgotMode ? 'Reset Password' : (mode === 'signin' ? 'Sign In' : 'Sign Up')}
            isOpen={isOpen}
            onClose={() => {
                onClose();
                setEmail('');
                setMode('signin');
                setForgotMode(false);
                setResetEmail('');
            }}
            defaultPosition={{ x: window.innerWidth / 2 - 160, y: window.innerHeight * 0.15 }}
            resizable={true}
            defaultWidth={320}
            defaultHeight={forgotMode ? 320 : 550}
            minWidth={250}
            minHeight={300}
        >
            <div className="px-6 py-5 flex flex-col gap-2 items-center mb-2">
                {forgotMode ? (
                    <>
                        <div className="text-lg font-semibold text-center mb-2">Reset your password</div>
                        <div className="text-xs text-muted-foreground text-center mb-4">Enter your email and we&apos;ll send you a password reset link.</div>
                        <form onSubmit={handleForgotPassword} className="flex flex-col gap-2 w-full">
                            <label htmlFor="reset-email" className="font-medium text-sm">Email</label>
                            <Input
                                id="reset-email"
                                type="email"
                                value={resetEmail}
                                onChange={e => setResetEmail(e.target.value)}
                                required
                                placeholder="you@email.com"
                                className="w-full text-sm"
                                size="md"
                                style={{ width: '100%' }}
                            />
                            <Button type="submit" variant="default" size="sm" disabled={loading} className="rounded-md mt-1 w-full text-sm" style={{ width: '100%' }}>
                                {loading ? 'Sending...' : 'Send reset link'}
                            </Button>
                        </form>
                        <button
                            type="button"
                            className="text-xs text-blue-500 mt-3 hover:underline"
                            onClick={() => setForgotMode(false)}
                        >
                            Back to sign in
                        </button>
                    </>
                ) : (
                    <>
                        <div className="text-lg font-semibold text-center">
                            {mode === 'signin' ? 'Welcome back!' : 'Create your account'}
                        </div>
                        <div className="text-xs text-muted-foreground text-center mb-2">
                            {mode === 'signin' ? 'Sign in to continue to the app.' : 'Sign up to get started.'}
                        </div>
                        <Tabs value={mode} onValueChange={setMode}>
                            <TabsList className="flex justify-center gap-0 text-sm">
                                <TabsTrigger value="signin" className="w-1/2 text-sm">Sign In</TabsTrigger>
                                <TabsTrigger value="signup" className="w-1/2 text-sm">Sign Up</TabsTrigger>
                            </TabsList>
                        </Tabs>
                        <form onSubmit={handleAuth} className="flex flex-col gap-2 w-full">
                            <label htmlFor="auth-email" className="font-medium text-sm">Email</label>
                            <Input
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                placeholder="you@email.com"
                                className="w-full text-sm"
                                size="md"
                                style={{ width: '100%' }}
                            />
                            {mode === 'signup' && (
                                <>
                                    <label htmlFor="auth-name" className="font-medium text-sm">Name</label>
                                    <Input
                                        id="auth-name"
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                        placeholder="Your name"
                                        className="w-full text-sm"
                                        size="md"
                                        style={{ width: '100%' }}
                                    />
                                    <label htmlFor="auth-password" className="font-medium text-sm">Password</label>
                                    <Input
                                        id="auth-password"
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        placeholder="Create a password"
                                        className="w-full text-sm"
                                        size="md"
                                        style={{ width: '100%' }}
                                    />
                                    <PasswordStrengthMeter password={password} />
                                    <label htmlFor="auth-confirm-password" className="font-medium text-sm">Confirm Password</label>
                                    <Input
                                        id="auth-confirm-password"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        required
                                        placeholder="Repeat your password"
                                        className="w-full text-sm"
                                        size="md"
                                        style={{ width: '100%' }}
                                    />
                                </>
                            )}
                            {mode === 'signin' && (
                                <>
                                    <label htmlFor="auth-password" className="font-medium text-sm">Password</label>
                                    <Input
                                        id="auth-password"
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        placeholder="Your password"
                                        className="w-full text-sm"
                                        size="md"
                                        style={{ width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        className="text-xs text-blue-500 mt-1 mb-2 text-left hover:underline"
                                        onClick={() => setForgotMode(true)}
                                        style={{ alignSelf: 'flex-start' }}
                                    >
                                        Forgot password?
                                    </button>
                                </>
                            )}
                            <Button type="submit" variant="default" size="sm" disabled={loading} className="rounded-md mt-1 w-full text-sm" style={{ width: '100%' }}>
                                {loading ? (mode === 'signup' ? 'Signing up...' : 'Signing in...') : (mode === 'signin' ? 'Sign In' : 'Sign Up')}
                            </Button>
                        </form>
                        {/* <div className="flex items-center my-4 w-full">
                            <div className="flex-grow border-t border-border" />
                            <span className="mx-3 text-xs text-muted-foreground">or</span>
                            <div className="flex-grow border-t border-border" />
                        </div>
                        <div className="flex flex-col gap-2 w-full"> */}
                        {/*
                            <Button
                                type="button"
                                onClick={() => handleSocial('google')}
                                className="flex items-center justify-center w-full h-9 px-4 border border-border bg-white text-[#1F1F1F] font-medium text-sm rounded-md transition hover:bg-[#f7f7f7] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4285F4] gap-2 dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#232325]"
                                style={{ fontFamily: 'Roboto, Arial, sans-serif' }}
                            >
                                <span className="flex items-center mr-2" style={{ marginLeft: 0, marginRight: 10 }}>
                                    <svg width="18" height="18" viewBox="0 0 18 18">
                                        <g>
                                            <path fill="#4285F4" d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4818h4.8445c-.2082 1.1218-.8345 2.0736-1.7764 2.7136v2.2545h2.8736c1.6827-1.5518 2.6582-3.8382 2.6582-6.6082z"/>
                                            <path fill="#34A853" d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1864l-2.8736-2.2545c-.7973.5345-1.8136.8491-3.0827.8491-2.3691 0-4.3773-1.6018-5.0964-3.7573H.9391v2.3545C2.4227 16.2936 5.4818 18 9 18z"/>
                                            <path fill="#FBBC05" d="M3.9036 10.6518c-.1818-.5345-.2864-1.1045-.2864-1.6518s.1045-1.1173.2864-1.6518V5.9945H.9391C.3409 7.2218 0 8.5745 0 10c0 1.4255.3409 2.7782.9391 4.0055l2.9645-2.3545z"/>
                                            <path fill="#EA4335" d="M9 3.5791c1.3227 0 2.5045.4545 3.4364 1.3455l2.5773-2.5773C13.4645.8064 11.4273 0 9 0 5.4818 0 2.4227 1.7064.9391 4.0055l2.9645 2.3545C4.6227 5.1809 6.6309 3.5791 9 3.5791z"/>
                                        </g>
                                    </svg>
                                </span>
                                Sign in with Google
                            </Button>
                            */}
                        {/* </div> */}
                    </>
                )}
            </div>
        </DraggableModal>
    );
}

AuthModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    mode: PropTypes.string,
    setMode: PropTypes.func,
    onSignupSuccess: PropTypes.func
}; 