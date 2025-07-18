### Test run
- npm run dev
- need to remove the cdn and use the tailwind plugin for production 
### Bugs and Features
- For the case of lambda=-1 and beta =pi/4 the visuzlation doesnt show any place with red where the it is maximum (check color plotting with tauxy maybe error in web gl integration) (check the new formual again for tou and confirm the derivation )


- **Do i keep the min max dots, as it is found by brute force method and it doesnt add any significant value as sometimes there are multiple poitns where the min and max values are the same**
- lambda 0 and beta 45 txy case, the points location
- changing beta values causes the min max dots to move further
- The visualization is correct the dots are not being roperly places:
    two possible areas:
    - conversion form pixel to ndc to csss
    - or the indexing system logic for min max
- best to print out the values and see if there is a way to wirte the values to file as the values are too big to print in console
or may be try for a small grid and see (50 to start with )

