import React, { useState } from 'react';
import { DraggableModal } from '../modal/DraggableModal';
import { Button } from '../button';
import PropTypes from 'prop-types';

export function AuthModal({ isOpen, onClose }) {
    const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);

    const handleEmailAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus('');
        const res = await fetch('/api/auth/signin/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ email }),
        });
        setLoading(false);
        if (res.ok) {
            setStatus('Check your email for a magic link!');
        } else {
            setStatus('Error sending magic link.');
        }
    };

    const handleSocial = (provider) => {
        window.location.href = `/api/auth/signin/${provider}`;
    };

    return (
        <DraggableModal
            title={mode === 'signin' ? 'Sign In' : 'Sign Up'}
            isOpen={isOpen}
            onClose={() => {
                onClose();
                setStatus('');
                setEmail('');
                setMode('signin');
            }}
            defaultPosition={{ x: 80, y: 120 }}
            resizable={true}
            defaultWidth={320}
            defaultHeight={450}
            minWidth={250}
            minHeight={300}
        >
            <div className="flex flex-col gap-2 items-center mb-2">
                <div className="text-lg font-semibold text-center">
                    {mode === 'signin' ? 'Welcome back!' : 'Create your account'}
                </div>
                <div className="text-xs text-muted-foreground text-center mb-2">
                    {mode === 'signin' ? 'Sign in to continue to the app.' : 'Sign up to get started.'}
                </div>
                <div className="flex gap-2 w-full justify-center mb-2">
                    <Button
                        variant={mode === 'signin' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMode('signin')}
                        className="w-1/2 rounded-full"
                    >
                        Sign In
                    </Button>
                    <Button
                        variant={mode === 'signup' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMode('signup')}
                        className="w-1/2 rounded-full"
                    >
                        Sign Up
                    </Button>
                </div>
            </div>
            <form onSubmit={handleEmailAuth} className="flex flex-col gap-3 px-1">
                <label htmlFor="auth-email" className="font-medium text-sm">Email</label>
                <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="you@email.com"
                />
                <Button type="submit" variant="default" size="sm" disabled={loading} className="rounded-full mt-1">
                    {loading ? 'Sending...' : (mode === 'signin' ? 'Sign In with Magic Link' : 'Sign Up with Magic Link')}
                </Button>
                {status && <div className={`text-xs text-center mt-1 ${status.startsWith('Check') ? 'text-green-600' : 'text-red-500'}`}>{status}</div>}
            </form>
            <div className="flex items-center my-4">
                <div className="flex-grow border-t border-border" />
                <span className="mx-3 text-xs text-muted-foreground">or</span>
                <div className="flex-grow border-t border-border" />
            </div>
            <div className="flex flex-col gap-2 px-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSocial('google')}
                    className="rounded-full flex items-center gap-2 hover:bg-[#f5f5f5] hover:text-primary transition"
                >
                    <svg width="18" height="18" viewBox="0 0 48 48" className="inline-block mr-1"><g><path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.1 30.1 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c2.6 0 5 .8 7 2.3l6.4-6.4C33.5 6.5 28.1 4 22 4 11.5 4 3 12.5 3 23s8.5 19 19 19c9.5 0 18-7.5 18-19 0-1.3-.1-2.7-.5-4z"/><path fill="#34A853" d="M6.3 14.7l7 5.1C15.5 17.1 19.4 14 24 14c2.6 0 5 .8 7 2.3l6.4-6.4C33.5 6.5 28.1 4 22 4c-7.2 0-13.3 4.1-16.7 10.7z"/><path fill="#FBBC05" d="M24 44c6.1 0 11.2-2 14.9-5.4l-7-5.7C30.1 36 27.2 37 24 37c-6.1 0-11.2-2-14.9-5.4l7-5.7C17.9 33.1 21.9 36 24 36z"/><path fill="#EA4335" d="M44.5 20H24v8.5h11.7C34.7 33.1 30.1 36 24 36c-4.6 0-8.5-3.1-10.7-7.3l-7 5.7C8.8 39.9 15.1 44 24 44c7.2 0 13.3-4.1 16.7-10.7z"/></g></svg>
                    Continue with Google
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSocial('github')}
                    className="rounded-full flex items-center gap-2 hover:bg-[#f5f5f5] hover:text-primary transition"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="inline-block mr-1"><path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.091-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.987 1.029-2.686-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.699 1.028 1.593 1.028 2.686 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.417-.012 2.747 0 .267.18.577.688.479C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2z"/></svg>
                    Continue with GitHub
                </Button>
            </div>
        </DraggableModal>
    );
}

AuthModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
}; 