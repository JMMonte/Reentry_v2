import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X, GripHorizontal } from 'lucide-react';

// Module-level z-index tracker (now truly global)
if (typeof window !== 'undefined') {
  if (!window.__GLOBAL_MODAL_Z_INDEX__) window.__GLOBAL_MODAL_Z_INDEX__ = 9999;
}
const getGlobalZIndex = () => (typeof window !== 'undefined' ? window.__GLOBAL_MODAL_Z_INDEX__ : 9999);
const bumpGlobalZIndex = () => (typeof window !== 'undefined' ? ++window.__GLOBAL_MODAL_Z_INDEX__ : 10000);

export function DraggableModal({ 
  title, 
  children, 
  defaultPosition = { x: 20, y: 80 },
  rightElement,
  leftElement,
  className = '',
  isOpen = true,
  onClose = () => {},
  defaultCollapsed = false,
  minHeight,
  maxHeight,
  minWidth = 200,
  maxWidth,
  resizable = false,
  defaultHeight = 'auto',
  defaultWidth = 600,
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [position, setPosition] = useState(defaultPosition);
  const [height, setHeight] = useState(defaultHeight);
  const [width, setWidth] = useState(defaultWidth);
  const [zIndex, setZIndex] = useState(getGlobalZIndex());
  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });
  const resizeRef = useRef({ isResizing: false, startY: 0, startX: 0, startHeight: 0, startWidth: 0, direction: null });

  // Update dimensions based on content only for resizable modals
  useEffect(() => {
    if (resizable && !isCollapsed && contentRef.current && height === 'auto') {
      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const maxDefaultHeight = viewportHeight * 0.5;
      if (contentHeight < maxDefaultHeight) {
        setHeight(contentHeight);
      } else {
        setHeight(maxDefaultHeight);
      }
    }
  }, [isCollapsed, children, resizable, height]);

  const startDragging = (e) => {
    // Bring this modal to front
    setZIndex(bumpGlobalZIndex());
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  const startResizing = (e, direction) => {
    e.preventDefault();
    resizeRef.current = {
      isResizing: true,
      startY: e.clientY,
      startX: e.clientX,
      startHeight: modalRef.current.offsetHeight,
      startWidth: modalRef.current.offsetWidth,
      direction,
    };
  };

  const onDrag = (e) => {
    if (dragRef.current.isDragging) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      setPosition({ x: newX, y: newY });
    }
    if (resizeRef.current.isResizing) {
      if (resizeRef.current.direction === 'vertical' || resizeRef.current.direction === 'both') {
        const deltaY = e.clientY - resizeRef.current.startY;
        const newHeight = Math.max(
          minHeight || 0,
          Math.min(
            resizeRef.current.startHeight + deltaY,
            maxHeight || window.innerHeight * 0.9
          )
        );
        setHeight(newHeight);
      }
      if (resizeRef.current.direction === 'horizontal' || resizeRef.current.direction === 'both') {
        const deltaX = e.clientX - resizeRef.current.startX;
        const newWidth = Math.max(
          minWidth,
          Math.min(
            resizeRef.current.startWidth + deltaX,
            maxWidth || window.innerWidth * 0.9
          )
        );
        setWidth(newWidth);
      }
    }
  };

  const stopDragging = () => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
  };

  React.useEffect(() => {
    if (isOpen) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDragging);
      return () => {
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', stopDragging);
      };
    }
  }, [isOpen]);

  // Bring to front on any click
  const bringToFront = () => {
    setZIndex(bumpGlobalZIndex());
  };

  // Bring to front on mount or when opened
  useEffect(() => {
    if (isOpen) {
      bringToFront();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`fixed bg-background border rounded-lg shadow-lg ${className}`}
      style={{ 
        left: position.x,
        top: position.y,
        height: isCollapsed ? 'auto' : (resizable ? height : 'auto'),
        width: resizable ? width : 'auto',
        minHeight: isCollapsed ? 'auto' : minHeight,
        minWidth,
        maxHeight: isCollapsed ? 'auto' : (resizable ? (maxHeight || window.innerHeight * 0.9) : 'none'),
        maxWidth: resizable ? (maxWidth || window.innerWidth * 0.9) : 'none',
        zIndex,
      }}
      onMouseDown={bringToFront}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 bg-secondary/50 cursor-move select-none rounded-t-lg"
        onMouseDown={startDragging}
      >
        <div className="flex items-center gap-2">
          {leftElement}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {rightElement}
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          <div 
            ref={contentRef} 
            className={`overflow-auto ${resizable ? 'pb-2' : ''}`}
            style={{ 
              height: resizable ? 'calc(100% - 48px)' : 'auto',
              padding: '8px'
            }}
          >
            {children}
          </div>
          {resizable && (
            <>
              {/* Bottom resize handle */}
              <div
                className="absolute bottom-0 left-2 right-2 h-2 bg-secondary/50 cursor-ns-resize hover:bg-primary/50 flex items-center justify-center border-t rounded-b"
                onMouseDown={(e) => startResizing(e, 'vertical')}
              >
                <GripHorizontal className="h-3 w-3 text-muted-foreground" />
              </div>
              {/* Right resize handle */}
              <div
                className="absolute top-2 bottom-2 right-0 w-2 bg-secondary/50 cursor-ew-resize hover:bg-primary/50"
                onMouseDown={(e) => startResizing(e, 'horizontal')}
              />
              {/* Corner resize handle */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 bg-secondary/50 cursor-nwse-resize hover:bg-primary/50 rounded-bl"
                onMouseDown={(e) => startResizing(e, 'both')}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
