export default class ContextMenu {

    #menu;
    #bindings           = new Map();
    #contextEvent       = null;
    #keepOpenElement    = null;
    #actionPending      = false;

    #handlePointerDown = (event) => {
        if (!this.#menu.contains(event.target)) {
            this.hide();
        }
    };

    #handleKeyDown = (event) => {
        if (event.key === "Escape") {
            this.hide();
        }
    };

    constructor() {

        this.#menu = document.createElement("div");
        this.#menu.className = "context-menu";
        this.#menu.setAttribute("role", "menu");
        this.#menu.hidden = true;

        this.#menu.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        document.body.appendChild(this.#menu);
        document.addEventListener("pointerdown", this.#handlePointerDown);
        document.addEventListener("keydown", this.#handleKeyDown);
    }


    /**
     * Asocia el menú a un elemento; los items pueden ser fijos o calcularse
     * a partir del evento contextmenu.
     */
    attach(target, items, { keepOpenElement = null } = {}) {

        if (!target || typeof target.addEventListener !== "function") {
            throw new TypeError("ContextMenu: el destino debe aceptar eventos");
        }

        if (
            keepOpenElement !== null &&
            typeof keepOpenElement.classList?.add !== "function"
        ) {
            throw new TypeError("ContextMenu: keepOpenElement debe ser un elemento DOM");
        }

        if (!Array.isArray(items) && typeof items !== "function") {
            throw new TypeError("ContextMenu: los items deben ser un array o una función");
        }

        const previousHandler = this.#bindings.get(target);
        if (previousHandler) {
            target.removeEventListener("contextmenu", previousHandler);
        }

        const handler = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const menuItems = typeof items === "function"
                ? items(event)
                : items;

            this.show(event, menuItems, keepOpenElement);
        };

        target.addEventListener("contextmenu", handler);
        this.#bindings.set(target, handler);

        return () => {
            if (this.#bindings.get(target) !== handler) {
                return;
            }

            target.removeEventListener("contextmenu", handler);
            this.#bindings.delete(target);
        };
    }


    show(event, items, keepOpenElement = null) {

        if (this.#actionPending) {
            return;
        }

        this.hide();

        if (!Array.isArray(items)) {
            throw new TypeError("ContextMenu: la función de items debe devolver un array");
        }

        if (items.length === 0) {
            return;
        }

        this.#contextEvent = event;
        this.setItems(items);
        this.#menu.hidden = false;
        this.#menu.style.left = `${event.clientX}px`;
        this.#menu.style.top = `${event.clientY}px`;

        const bounds = this.#menu.getBoundingClientRect();
        const left = Math.max(
            8,
            Math.min(event.clientX, window.innerWidth - bounds.width - 8)
        );
        const top = Math.max(
            8,
            Math.min(event.clientY, window.innerHeight - bounds.height - 8)
        );

        this.#menu.style.left = `${left}px`;
        this.#menu.style.top = `${top}px`;
        this.#keepOpenElement = keepOpenElement;
        this.#keepOpenElement?.classList.add("context-menu-open");
    }

    setItems(items, openSubmenuIndex = null) {
        if (!Array.isArray(items)) {
            throw new TypeError("ContextMenu: los items deben ser un array");
        }

        this.#menu.replaceChildren(
            ...items.map(item => this.#createItem(item))
        );

        if (openSubmenuIndex === null) {
            return;
        }

        const entry = this.#menu.children[openSubmenuIndex];
        const button = entry?.querySelector(".context-menu-button");
        const submenu = entry?.querySelector(".context-submenu");

        if (!button || !submenu) {
            throw new RangeError("ContextMenu: el elemento no tiene submenú");
        }

        entry.classList.add("open");
        button.setAttribute("aria-expanded", "true");
        this.#positionSubmenu(entry, submenu);
    }


    hide() {
        if (this.#actionPending) {
            return;
        }

        this.#menu.hidden = true;
        this.#menu.replaceChildren();
        this.#contextEvent = null;
        this.#keepOpenElement?.classList.remove("context-menu-open");
        this.#keepOpenElement = null;
    }


    destroy() {

        this.#actionPending = false;
        this.hide();

        for (const [target, handler] of this.#bindings) {
            target.removeEventListener("contextmenu", handler);
        }

        this.#bindings.clear();
        document.removeEventListener("pointerdown", this.#handlePointerDown);
        document.removeEventListener("keydown", this.#handleKeyDown);
        this.#menu.remove();
    }


    #createItem(item) {

        if (
            !item ||
            typeof item.label !== "string" ||
            typeof item.icon !== "string" ||
            item.icon.length === 0
        ) {
            throw new TypeError(
                "ContextMenu: cada item necesita label e icon"
            );
        }

        const children = item.children ?? [];
        if (!Array.isArray(children)) {
            throw new TypeError(
                `ContextMenu: children de '${item.label}' debe ser un array`
            );
        }

        if (item.action !== undefined && typeof item.action !== "function") {
            throw new TypeError(
                `ContextMenu: action de '${item.label}' debe ser una función`
            );
        }

        if (
            item.keepOpenAfterAction !== undefined &&
            typeof item.keepOpenAfterAction !== "boolean"
        ) {
            throw new TypeError(
                `ContextMenu: keepOpenAfterAction de '${item.label}' debe ser boolean`
            );
        }

        const entry = document.createElement("div");
        entry.className = "context-menu-entry";
        entry.setAttribute("role", "none");

        const button = document.createElement("button");
        button.type = "button";
        button.className = "context-menu-button";
        button.setAttribute("role", "menuitem");
        button.disabled = Boolean(item.disabled);

        const icon = document.createElement("span");
        icon.className = "context-menu-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = item.icon;

        const label = document.createElement("span");
        label.className = "context-menu-label";
        label.textContent = item.label;

        button.append(icon, label);
        entry.appendChild(button);

        if (children.length > 0) {
            const arrow = document.createElement("span");
            arrow.className = "context-menu-arrow";
            arrow.setAttribute("aria-hidden", "true");
            arrow.textContent = "›";
            button.appendChild(arrow);
            button.setAttribute("aria-haspopup", "menu");
            button.setAttribute("aria-expanded", "false");

            const submenu = document.createElement("div");
            submenu.className = "context-submenu";
            submenu.setAttribute("role", "menu");
            submenu.append(
                ...children.map(child => this.#createItem(child))
            );
            entry.appendChild(submenu);

            const openSubmenu = () => {
                entry.classList.add("open");
                button.setAttribute("aria-expanded", "true");
                this.#positionSubmenu(entry, submenu);
            };

            button.addEventListener("pointerenter", openSubmenu);
            button.addEventListener("focus", openSubmenu);
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                openSubmenu();

                if (item.action) {
                    await this.#runAction(button, item);
                }
            });

            entry.addEventListener("pointerleave", () => {
                if (!entry.contains(document.activeElement)) {
                    entry.classList.remove("open");
                    button.setAttribute("aria-expanded", "false");
                }
            });
        }
        else {
            button.addEventListener("click", async (event) => {
                event.stopPropagation();
                await this.#runAction(button, item);
            });
        }

        return entry;
    }

    async #runAction(button, item) {
        if (button.disabled || this.#actionPending) {
            return;
        }

        const contextEvent = this.#contextEvent;
        button.disabled = true;
        this.#actionPending = true;

        try {
            await item.action?.(contextEvent);
        }
        catch (error) {
            console.error(
                `ContextMenu: falló la acción '${item.label}'`,
                error
            );
        }
        finally {
            this.#actionPending = false;

            if (!item.keepOpenAfterAction) {
                this.hide();
            }
        }
    }


    #positionSubmenu(entry, submenu) {

        entry.classList.remove("opens-left", "opens-up");

        const entryBounds = entry.getBoundingClientRect();
        const submenuBounds = submenu.getBoundingClientRect();

        if (submenuBounds.right > window.innerWidth - 8) {
            entry.classList.add("opens-left");
        }

        if (
            entryBounds.top + submenuBounds.height > window.innerHeight - 8 &&
            entryBounds.bottom - submenuBounds.height >= 8
        ) {
            entry.classList.add("opens-up");
        }
    }
}
