// ============================================================================
// Widget standard — declarative contracts
// ----------------------------------------------------------------------------
// Every overlay widget (first-party today, marketplace later) is described by a
// WidgetDefinition. The manifest drives BOTH the editor properties panel and the
// runtime config defaults, so adding a widget never touches editor/renderer code.
// ============================================================================

/** A single configurable property. `value` is the default used on widget add. */
export type Field =
    | { type: 'text'; label: string; value: string; placeholder?: string }
    | { type: 'textarea'; label: string; value: string }
    | { type: 'dropdown'; label: string; options: Record<string, string>; value: string }
    | { type: 'image'; label: string; value?: string }
    | { type: 'color'; label: string; value: string }
    | { type: 'number'; label: string; value: number; min?: number; max?: number; step?: number }
    | { type: 'slider'; label: string; value: number; min: number; max: number; step?: number }
    | { type: 'checkbox'; label: string; value: boolean }
    | { type: 'font'; label: string; value: string };

/** The bundle that renders inside the sandboxed iframe. */
export interface WidgetBundle {
    html: string;
    css: string;
    /** Has access to the injected window API (onWidgetLoad / onEventReceived / SE_API). */
    js: string;
}

export interface WidgetDefinition {
    type: string;                          // 'tcg-pack', 'alert', 'chat' — unique key
    name: string;                          // editor palette label
    icon: string;                          // lucide icon name
    defaultSize: { width: number; height: number };
    fields: Record<string, Field>;         // declarative config schema
    /** Realtime listeners this widget reacts to, e.g. ['card-reveal']. Empty = static. */
    listens: string[];
    /**
     * 'bundle' — rendered in a sandboxed iframe via buildWidgetSrcDoc, driven by
     *   the injected onWidgetLoad/onEventReceived API. The standard for new widgets.
     * 'native' — legacy React-rendered widget (chat/goal/alert/...) kept in the
     *   renderer/editor switch during migration. Still registry-governed for its
     *   palette entry, default config, and (optionally) auto-generated fields.
     */
    renderMode: 'bundle' | 'native';
    /** Required when renderMode === 'bundle'. */
    bundle?: WidgetBundle;
}

/** fieldData = the per-instance config, keyed by the manifest's field names. */
export type FieldData = Record<string, string | number | boolean | undefined>;

/** Normalized event shape delivered to every widget via onEventReceived. */
export interface OverlayEvent {
    listener: string;                      // 'card-reveal' | 'follower-latest' | 'cheer-latest' ...
    event: {
        name?: string;                     // username / actor
        amount?: number;
        tier?: string;
        message?: string;
        // pack-specific
        cardImageUrl?: string;
        userCardId?: string;
        animationStyle?: string;
        [key: string]: unknown;
    };
}

/** Channel context passed once via onWidgetLoad. */
export interface ChannelContext {
    id: string;
    name: string;
    slug: string;
}
