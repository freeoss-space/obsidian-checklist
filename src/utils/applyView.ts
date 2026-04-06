import { ChecklistItem } from "src/models/types";
import { filterItems, FilterSpec } from "src/utils/filter";
import { sortItems, SortSpec } from "src/utils/sort";

export interface ViewState {
    filter?: FilterSpec;
    sort?: SortSpec;
}

export function applyView(items: ChecklistItem[], state: ViewState): ChecklistItem[] {
    const filtered = state.filter ? filterItems(items, state.filter) : items.slice();
    return state.sort ? sortItems(filtered, state.sort) : filtered;
}
