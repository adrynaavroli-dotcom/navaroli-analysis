import { Bold, Italic, List, ListOrdered, Heading2, Heading3, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

interface ToolbarButton {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prefix: string;
  suffix: string;
  block?: boolean;
}

const toolbarButtons: ToolbarButton[] = [
  { icon: Bold, label: "Negrita", prefix: "**", suffix: "**" },
  { icon: Italic, label: "Cursiva", prefix: "_", suffix: "_" },
  { icon: Heading2, label: "Encabezado 2", prefix: "## ", suffix: "", block: true },
  { icon: Heading3, label: "Encabezado 3", prefix: "### ", suffix: "", block: true },
  { icon: List, label: "Lista", prefix: "- ", suffix: "", block: true },
  { icon: ListOrdered, label: "Lista numerada", prefix: "1. ", suffix: "", block: true },
  { icon: Quote, label: "Cita", prefix: "> ", suffix: "", block: true },
];

export function MarkdownToolbar({ textareaRef, value, onChange }: MarkdownToolbarProps) {
  const insertFormat = (prefix: string, suffix: string, block?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let newText: string;
    let newCursorPos: number;

    if (block) {
      // For block elements, add at the start of the line
      const beforeSelection = value.substring(0, start);
      const lineStart = beforeSelection.lastIndexOf("\n") + 1;
      const beforeLine = value.substring(0, lineStart);
      const afterSelection = value.substring(end);

      if (selectedText) {
        // Apply to each line of selection
        const lines = selectedText.split("\n");
        const formattedLines = lines.map((line) => prefix + line);
        newText = beforeLine + value.substring(lineStart, start) + formattedLines.join("\n") + afterSelection;
        newCursorPos = start + prefix.length * lines.length + selectedText.length;
      } else {
        newText = beforeLine + prefix + value.substring(lineStart);
        newCursorPos = start + prefix.length;
      }
    } else {
      // For inline elements
      if (selectedText) {
        newText = value.substring(0, start) + prefix + selectedText + suffix + value.substring(end);
        newCursorPos = end + prefix.length + suffix.length;
      } else {
        newText = value.substring(0, start) + prefix + suffix + value.substring(end);
        newCursorPos = start + prefix.length;
      }
    }

    onChange(newText);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1 p-2 bg-muted/50 rounded-t-md border border-b-0 border-border">
        {toolbarButtons.map((button) => (
          <Tooltip key={button.label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => insertFormat(button.prefix, button.suffix, button.block)}
              >
                <button.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{button.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
