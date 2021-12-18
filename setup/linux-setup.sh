# not tested
install_neovim () {
  wget https://github.com/neovim/neovim/archive/refs/tags/v0.6.0.tar.gz # get neovim version 6 source code
  tar -xvf v0.6.0.tar.gz # unpackage the code
  cd neovim-0.6.0/ # go into the new directory made
  sudo apt-get update && sudo apt-get upgrade # update apt before installing
  sudo apt-get install ninja-build gettext libtool libtool-bin autoconf automake cmake g++ pkg-config unzip curl doxygen # install dependencies to install neovim
  make CMAKE_BUILD_TYPE=RelWithDebInfo # run makefile step 1
  sudo make install # run makefile step 2

  #node
  wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash #installs nvm (node version manager)
  export NVM_DIR="~/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
  nvm install 16
  #finish installing node

  nvim --headless +PlugInstall +qall # install neovim plugins
}

if ! [ -x "$(command -v nvim)" ]; then
  echo 'Intalling neovim...' >&2
  install_neovim()
  exit 1
else
  echo 'nvim is already installed'
fi
