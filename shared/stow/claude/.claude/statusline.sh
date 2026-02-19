#!/bin/bash

# Claude Code Status Line - Simple branch and token usage
# Reads JSON input from stdin and formats status line

input=$(cat)

# Get git branch if in a git repository
branch=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    branch=$(git branch --show-current 2>/dev/null)
fi

# Calculate token usage
usage=$(echo "$input" | jq '.context_window.current_usage')
if [[ "$usage" != "null" ]]; then
    current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    size=$(echo "$input" | jq '.context_window.context_window_size')
    pct=$((current * 100 / size))

    # Format tokens with K suffix
    if [[ $current -ge 1000 ]]; then
        current_k=$(echo "scale=1; $current / 1000" | bc)
        current_display="${current_k}K"
    else
        current_display="$current"
    fi

    if [[ $size -ge 1000 ]]; then
        size_k=$((size / 1000))
        size_display="${size_k}K"
    else
        size_display="$size"
    fi

    token_info=" | $current_display / $size_display ($pct%)"
else
    token_info=""
fi

# Format: branch | tokens
if [[ -n "$branch" ]]; then
    printf "%s%s" "$branch" "$token_info"
else
    printf "no git repo%s" "$token_info"
fi