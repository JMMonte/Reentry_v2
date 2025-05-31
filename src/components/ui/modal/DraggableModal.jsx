import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../button';
import { ChevronDown, ChevronUp, X, GripHorizontal } from 'lucide-react';
import PropTypes from 'prop-types';

// Module-level z-index tracker (now truly global)
if (typeof window !== 'undefined') {
  if (!window.__GLOBAL_MODAL_Z_INDEX__) window.__GLOBAL_MODAL_Z_INDEX__ = 9999;
}
const getGlobalZIndex = () => (typeof window !== 'undefined' ? window.__GLOBAL_MODAL_Z_INDEX__ : 9999);
const bumpGlobalZIndex = () => (typeof window !== 'undefined' ? ++window.__GLOBAL_MODAL_Z_INDEX__ : 10000);

// Performance: Throttle function for mouse events
function throttle(func, delay) {
  let timeoutId;
  let lastExecTime = 0;
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
}

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
  const [isMobile, setIsMobile] = useState(false);
  
  // Performance: Cache expensive calculations
  const constraints = useMemo(() => ({
    maxHeight: maxHeight || (typeof window !== 'undefined' ? window.innerHeight * 0.9 : 600),
    maxWidth: maxWidth || (typeof window !== 'undefined' ? window.innerWidth * 0.9 : 800),
    minHeight: minHeight || 0,
    minWidth
  }), [maxHeight, maxWidth, minHeight, minWidth]);

  // Performance: Batch position updates using RAF
  const updatePositionRAF = useRef();
  const updatePosition = useCallback((newPosition) => {
    if (updatePositionRAF.current) {
      cancelAnimationFrame(updatePositionRAF.current);
    }
    updatePositionRAF.current = requestAnimationFrame(() => {
      setPosition(newPosition);
    });
  }, []);

  // Performance: Batch size updates using RAF
  const updateSizeRAF = useRef();
  const updateSize = useCallback((newSize) => {
    if (updateSizeRAF.current) {
      cancelAnimationFrame(updateSizeRAF.current);
    }
    updateSizeRAF.current = requestAnimationFrame(() => {
      if (newSize.width !== undefined) setWidth(newSize.width);
      if (newSize.height !== undefined) setHeight(newSize.height);
      if (newSize.position) setPosition(newSize.position);
    });
  }, []);

  // Update dimensions based on content only for resizable modals
  useEffect(() => {
    if (resizable && !isCollapsed && contentRef.current && height === 'auto') {
      const contentHeight = contentRef.current.scrollHeight;
      const maxDefaultHeight = constraints.maxHeight;
      if (contentHeight < maxDefaultHeight) {
        setHeight(contentHeight);
      } else {
        setHeight(maxDefaultHeight);
      }
    }
  }, [isCollapsed, children, resizable, height, constraints.maxHeight]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const startDragging = useCallback((e) => {
    // Bring this modal to front
    setZIndex(bumpGlobalZIndex());
    dragRef.current = {
      isDragging: true,
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  }, [position]);

  const startResizing = useCallback((e, direction) => {
    e.preventDefault();
    resizeRef.current = {
      isResizing: true,
      startY: e.clientY,
      startX: e.clientX,
      startHeight: modalRef.current.offsetHeight,
      startWidth: modalRef.current.offsetWidth,
      startLeft: position.x,
      direction,
    };
  }, [position.x]);

  // Performance: Throttled drag handler
  const onDrag = useCallback(throttle((e) => {
    if (dragRef.current.isDragging) {
      const newX = e.clientX - dragRef.current.startX;
      const newY = e.clientY - dragRef.current.startY;
      updatePosition({ x: newX, y: newY });
    }
    if (resizeRef.current.isResizing) {
      const updates = {};
      
      // Vertical bottom resize (including corners)
      if (
        resizeRef.current.direction === 'vertical' ||
        (typeof resizeRef.current.direction === 'string' && resizeRef.current.direction.includes('both'))
      ) {
        const deltaY = e.clientY - resizeRef.current.startY;
        const newHeight = Math.max(
          constraints.minHeight,
          Math.min(resizeRef.current.startHeight + deltaY, constraints.maxHeight)
        );
        updates.height = newHeight;
      }
      
      // Horizontal right resize
      if (
        resizeRef.current.direction === 'horizontal-right' ||
        resizeRef.current.direction === 'both-right'
      ) {
        const deltaX = e.clientX - resizeRef.current.startX;
        const newWidth = Math.max(
          constraints.minWidth,
          Math.min(resizeRef.current.startWidth + deltaX, constraints.maxWidth)
        );
        updates.width = newWidth;
      }
      
      // Horizontal left resize (keeping right edge fixed)
      if (
        resizeRef.current.direction === 'horizontal-left' ||
        resizeRef.current.direction === 'both-left'
      ) {
        const rawDeltaX = e.clientX - resizeRef.current.startX;
        const possibleWidth = resizeRef.current.startWidth - rawDeltaX;
        const newWidth = Math.max(
          constraints.minWidth,
          Math.min(possibleWidth, constraints.maxWidth)
        );
        const deltaWidth = resizeRef.current.startWidth - newWidth;
        const newX = resizeRef.current.startLeft + deltaWidth;
        updates.width = newWidth;
        updates.position = { x: newX, y: position.y };
      }
      
      if (Object.keys(updates).length > 0) {
        updateSize(updates);
      }
    }
  }, 16), [constraints, position.y, updatePosition, updateSize]); // ~60fps throttling

  const stopDragging = useCallback(() => {
    dragRef.current.isDragging = false;
    resizeRef.current.isResizing = false;
  }, []);

  // Performance: Only add events when actually dragging/resizing
  useEffect(() => {
    if (!isOpen) return;
    
    let isActive = false;
    
    const checkActive = () => {
      isActive = dragRef.current.isDragging || resizeRef.current.isResizing;
    };
    
    const conditionalOnDrag = (e) => {
      checkActive();
      if (isActive) onDrag(e);
    };
    
    const conditionalStopDragging = () => {
      checkActive();
      if (isActive) stopDragging();
    };

    // Only add expensive global listeners when actually needed
    window.addEventListener('mousemove', conditionalOnDrag, { passive: true });
    window.addEventListener('mouseup', conditionalStopDragging);
    
    return () => {
      window.removeEventListener('mousemove', conditionalOnDrag);
      window.removeEventListener('mouseup', conditionalStopDragging);
      // Cancel any pending RAF calls
      if (updatePositionRAF.current) cancelAnimationFrame(updatePositionRAF.current);
      if (updateSizeRAF.current) cancelAnimationFrame(updateSizeRAF.current);
    };
  }, [isOpen, onDrag, stopDragging]);

  // Bring to front on any click
  const bringToFront = useCallback(() => {
    setZIndex(bumpGlobalZIndex());
  }, []);

  // Bring to front on mount or when opened
  useEffect(() => {
    if (isOpen) {
      bringToFront();
    }
  }, [isOpen, bringToFront]);

  // Performance: Memoize modal style calculation
  const modalStyle = useMemo(() => {
    if (isMobile) {
      return {
        left: '1vw',
        top: 'unset',
        bottom: 0,
        width: '98vw',
        minWidth: 0,
        maxWidth: '98vw',
        height: 'calc(100vh - 76px)', // 72px navbar + 4px gap
        minHeight: 0,
        maxHeight: 'calc(100vh - 76px)',
        zIndex,
        transform: 'none', // Don't use transform on mobile
      };
    } else {
      return {
        height: isCollapsed ? 'auto' : (resizable ? height : 'auto'),
        width: resizable ? width : 'auto',
        minHeight: isCollapsed ? 'auto' : constraints.minHeight,
        minWidth: constraints.minWidth,
        maxHeight: isCollapsed ? 'auto' : (resizable ? constraints.maxHeight : 'none'),
        maxWidth: resizable ? constraints.maxWidth : 'none',
        zIndex,
        // Performance: Use will-change for better rendering
        willChange: dragRef.current.isDragging || resizeRef.current.isResizing ? 'transform' : 'auto',
      };
    }
  }, [isMobile, position, isCollapsed, resizable, height, width, constraints, zIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className={`fixed bg-background/95 border rounded-lg shadow-lg ${className} group ${isMobile ? 'touch-none' : ''}`}
      style={{
        ...modalStyle,
        contain: 'layout style paint',
        // Use transform for hardware acceleration on desktop, left/top on mobile
        ...(isMobile ? {} : {
          transform: `translate(${position.x}px, ${position.y}px)`,
          left: 0,
          top: 0,
        }),
      }}
      onMouseDown={bringToFront}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-2 bg-secondary/50 select-none rounded-t-lg ${isMobile ? '' : 'cursor-move'}`}
        onMouseDown={isMobile ? undefined : startDragging}
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
            className={`modal-content overflow-auto ${resizable && !isMobile ? 'pb-2' : ''}`}
            style={{ 
              height: resizable && !isMobile ? 'calc(100% - 48px)' : 'auto',
              padding: '8px'
            }}
          >
            {children}
          </div>
          {/* Resize handles only on desktop */}
          {resizable && !isMobile && (
            <>
              {/* Left resize handle */}
              <div
                className="absolute top-2 bottom-2 -left-px w-1 cursor-ew-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'horizontal-left')}
              />
              {/* Right resize handle */}
              <div
                className="absolute top-2 bottom-2 -right-px w-1 cursor-ew-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'horizontal-right')}
              />
              {/* Bottom resize handle */}
              <div
                className="absolute left-2 right-2 -bottom-px h-1 cursor-ns-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'vertical')}
              />
              {/* Bottom-left corner resize handle */}
              <div
                className="absolute -bottom-px -left-px w-3 h-3 cursor-sw-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'both-left')}
              />
              {/* Bottom-right corner resize handle */}
              <div
                className="absolute -bottom-px -right-px w-3 h-3 cursor-se-resize bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'both-right')}
              />
              {/* Bottom center resize handle with grip icon */}
              <div
                className="absolute -bottom-px left-1/2 transform -translate-x-1/2 w-6 h-2 cursor-ns-resize flex items-center justify-center bg-primary opacity-0 hover:opacity-100 transition-opacity duration-150 rounded-full"
                onMouseDown={(e) => startResizing(e, 'vertical')}
              >
                <GripHorizontal className="h-2 w-2 text-primary-foreground" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

DraggableModal.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node,
  defaultPosition: PropTypes.shape({
    x: PropTypes.number,
    y: PropTypes.number,
  }),
  rightElement: PropTypes.node,
  leftElement: PropTypes.node,
  className: PropTypes.string,
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  defaultCollapsed: PropTypes.bool,
  minHeight: PropTypes.number,
  maxHeight: PropTypes.number,
  minWidth: PropTypes.number,
  maxWidth: PropTypes.number,
  resizable: PropTypes.bool,
  defaultHeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  defaultWidth: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};