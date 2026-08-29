-- Personal input overrides loaded after Omarchy's defaults.

hl.config({
  input = {
    -- Keep the conventional Caps Lock-as-Control mapping.
    kb_options = "ctrl:nocaps",

    -- Reduce pointer travel from the default sensitivity of 0.
    sensitivity = -0.9,
  },
})

-- Keep the laptop trackpad at Hyprland's default sensitivity while external
-- mice continue to use the global sensitivity above.
hl.device({
  name = "pixa3854:00-093a:0274-touchpad",
  sensitivity = 0,
})
