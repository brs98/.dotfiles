-- Rex config: https://www.superlogical.com/rex/docs/customize/config

-- AeroSpace owns cmd+<number> for workspaces, so tabs move to alt+<number>.
for i = 1, 9 do
  rex.bind("alt+" .. i, "client.tab.goto", { index = i })
end
