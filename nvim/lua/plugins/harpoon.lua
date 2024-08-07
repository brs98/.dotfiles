local utils = require("../utils")
local addDescription = utils.addDescription
return {
	"ThePrimeagen/harpoon",
      --stylua: ignore
      keys = {
        { "<leader>ha", function() require("harpoon.mark").add_file() end, desc = "Add File" },
        { "<leader>hf", function() require("harpoon.ui").toggle_quick_menu() end, desc = "File Menu" },
        { "<leader>1", function() require("harpoon.ui").nav_file(1) end, addDescription("File 1") },
        { "<leader>2", function() require("harpoon.ui").nav_file(2) end, addDescription("File 2") },
	{ "<leader>3", function() require("harpoon.ui").nav_file(3) end, addDescription("File 3") },
	{ "<leader>4", function() require("harpoon.ui").nav_file(4) end, addDescription("File 4") },
      },
	opts = {
		global_settings = {
			save_on_toggle = true,
			enter_on_sendcmd = true,
		},
	},
}
