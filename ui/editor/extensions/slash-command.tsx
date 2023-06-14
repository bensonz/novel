import React, { useState, useEffect, useCallback, ReactNode } from "react";
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";
import { Edit3, Bold, Heading1, Heading2, Italic } from "lucide-react";
import LoadingCircle from "@/ui/shared/loading-circle";

const Command = Extension.create({
  name: "slash-command",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

interface CommandItemProps {
  title: string;
  description: string;
  icon: ReactNode;
}

const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: "Continue writing",
      description: "Use AI to expand your thoughts.",
      icon: <Edit3 size={18} />,
    },
    {
      title: "Heading 1",
      description: "Big section heading.",
      icon: <Heading1 size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 1 })
          .run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium section heading.",
      icon: <Heading2 size={18} />,
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 2 })
          .run();
      },
    },
    {
      title: "Bold",
      description: "Make text bold.",
      icon: <Bold size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setMark("bold").run();
      },
    },
    {
      title: "Italic",
      description: "Make text italic.",
      icon: <Italic size={18} />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setMark("italic").run();
      },
    },
  ].filter((item) => {
    if (typeof query === "string" && query.length > 0) {
      return item.title.toLowerCase().includes(query.toLowerCase());
    }
    return true;
  });
  // .slice(0, 10);
};

const CommandList = ({
  items,
  command,
  editor,
  range,
}: {
  items: CommandItemProps[];
  command: any;
  editor: any;
  range: any;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [generating, setGenerating] = useState(false);

  const predict = useCallback(
    async (content: string) => {
      setGenerating(true);
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      });
      if (!response.ok) {
        throw new Error(response.statusText);
      }

      // This data is a ReadableStream
      const data = response.body;
      if (!data) {
        return;
      }
      let completionLength = 0;

      editor.chain().focus().deleteRange(range).run();
      const reader = data.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        console.log({ chunkValue });
        editor.chain().focus().insertContent(chunkValue).run();
        completionLength += chunkValue.length;
      }
      editor.commands.setTextSelection({
        from: range.from,
        to: range.from + completionLength,
      });
      setGenerating(false);
    },
    [editor, range],
  );

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        if (item.title === "Continue writing") {
          const text = editor.getText();
          predict(text);
        } else {
          command(item);
        }
      }
    },
    [predict, command, editor, items],
  );

  useEffect(() => {
    const navigationKeys = ["ArrowUp", "ArrowDown", "Enter"];
    const onKeyDown = (e: KeyboardEvent) => {
      console.log({ e });
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === "ArrowUp") {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (e.key === "ArrowDown") {
          setSelectedIndex((selectedIndex + 1) % items.length);
          return true;
        }
        if (e.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [items, selectedIndex, setSelectedIndex, selectItem]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  return items.length > 0 ? (
    <div className="z-50 h-auto max-h-[300px] w-72 overflow-auto rounded-md border border-gray-200 bg-white px-1 py-2 shadow-md transition-all">
      {items.map((item: CommandItemProps, index: number) => {
        return (
          <button
            className={`flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-stone-900 hover:bg-stone-100 ${
              index === selectedIndex ? "bg-stone-100 text-stone-900" : ""
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white">
              {item.title === "Continue writing" && generating ? (
                <LoadingCircle />
              ) : (
                item.icon
              )}
            </div>
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-stone-500">{item.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  ) : null;
};

const renderItems = () => {
  let component;
  let popup;

  return {
    onStart: (props) => {
      component = new ReactRenderer(CommandList, {
        props,
        editor: props.editor,
      });

      popup = tippy("body", {
        getReferenceClientRect: props.clientRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },
    onUpdate(props) {
      component.updateProps(props);

      popup &&
        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
    },
    onKeyDown(props) {
      if (props.event.key === "Escape") {
        popup[0].hide();

        return true;
      }

      return component.ref?.onKeyDown(props);
    },
    onExit() {
      popup[0].destroy();
      component?.destroy();
    },
  };
};

const SlashCommand = Command.configure({
  suggestion: {
    items: getSuggestionItems,
    render: renderItems,
  },
});

export default SlashCommand;