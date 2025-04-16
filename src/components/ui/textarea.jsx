import * as React from "react";
import { cn } from "../../lib/utils";
import PropTypes from "prop-types";

const Textarea = React.forwardRef(
    (
        {
            className,
            textareaClassName,
            minRows = 1,
            maxRows = 8,
            minHeight,
            maxHeight,
            ...props
        },
        ref
    ) => {
        const innerRef = React.useRef();
        const combinedRef = ref || innerRef;

        // Auto-resize logic
        const resizeTextarea = () => {
            const textarea = combinedRef.current;
            if (!textarea) return;
            textarea.style.height = "auto";
            let newHeight = textarea.scrollHeight;
            if (maxHeight) newHeight = Math.min(newHeight, maxHeight);
            textarea.style.height = `${newHeight}px`;
        };

        React.useEffect(() => {
            resizeTextarea();
        }, [props.value]);

        return (
            <div className={cn("relative flex items-center", className)}>
                <textarea
                    ref={combinedRef}
                    rows={minRows}
                    className={cn(
                        "flex w-full resize-none rounded-md border px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-background text-foreground",
                        textareaClassName
                    )}
                    style={{
                        minHeight: minHeight || `${minRows * 1.75}rem`,
                        maxHeight: maxHeight || `${maxRows * 1.75}rem`,
                        ...props.style
                    }}
                    onInput={resizeTextarea}
                    {...props}
                />
            </div>
        );
    }
);

Textarea.displayName = "Textarea";
Textarea.propTypes = {
    className: PropTypes.string,
    textareaClassName: PropTypes.string,
    minRows: PropTypes.number,
    maxRows: PropTypes.number,
    minHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    maxHeight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    value: PropTypes.any,
    style: PropTypes.object,
};

export { Textarea }; 