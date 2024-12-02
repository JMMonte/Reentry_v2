import React, { useState, useRef, useCallback } from 'react';
import { Button } from '../button';
import { X } from 'lucide-react';
import SatelliteCreator from './SatelliteCreator';

const SatelliteModal = ({ isOpen, onClose, onCreateSatellite }) => {
    const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
    const popupRef = useRef(null);
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });

    const startDragging = (e) => {
        if (popupRef.current) {
            dragRef.current = {
                isDragging: true,
                startX: e.clientX - position.x,
                startY: e.clientY - position.y
            };
            e.preventDefault();
        }
    };

    const onDrag = useCallback((e) => {
        if (dragRef.current.isDragging && popupRef.current) {
            const newX = e.clientX - dragRef.current.startX;
            const newY = e.clientY - dragRef.current.startY;
            
            const maxX = window.innerWidth - popupRef.current.offsetWidth;
            const maxY = window.innerHeight - popupRef.current.offsetHeight;
            
            setPosition({
                x: Math.max(0, Math.min(newX, maxX)),
                y: Math.max(0, Math.min(newY, maxY))
            });
        }
    }, []);

    const stopDragging = useCallback(() => {
        dragRef.current.isDragging = false;
    }, []);

    React.useEffect(() => {
        if (isOpen) {
            window.addEventListener('mousemove', onDrag);
            window.addEventListener('mouseup', stopDragging);
            return () => {
                window.removeEventListener('mousemove', onDrag);
                window.removeEventListener('mouseup', stopDragging);
            };
        }
    }, [isOpen, onDrag, stopDragging]);

    if (!isOpen) return null;

    return (
        <div
            ref={popupRef}
            className="fixed z-50 bg-background/80 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: '220px',
            }}
        >
            <div 
                className="flex justify-between items-center p-1 bg-muted/50 cursor-move select-none border-b"
                onMouseDown={startDragging}
            >
                <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold">New Satellite</span>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-5 w-5 hover:bg-muted text-destructive hover:text-destructive"
                    onClick={onClose}
                >
                    <X className="h-3 w-3" />
                </Button>
            </div>
            <div className="p-1">
                <SatelliteCreator onCreateSatellite={(data) => {
                    onCreateSatellite(data);
                    onClose();
                }} />
            </div>
        </div>
    );
};

export default SatelliteModal;
